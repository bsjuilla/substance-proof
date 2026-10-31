// Measures the second reader. Muse Spark's readings come from a saved eval run (no Meta credit is spent on them);
// Muse Glimmer reads every document again from scratch (photos via the SAM-redacted copy, as in the app). Scores:
//  1) Glimmer alone against the answer key (facts and verdicts), the same way Muse Spark is scored
//  2) the combined result: Muse Spark's verdict plus the SECOND-READER check, against the answer key
// Usage: SET=test REPLAY=<run> [GLIMMER_REPLAY=<glimmer run>] npx tsx scripts/eval-second-reader.ts [meetingId ...]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verdictFrom } from "../src/engine/evaluate";
import type { Fact } from "../src/engine/types";
import { decide, IMAGE_EXT, isRecording, pool, type AnyExtract } from "../src/extract/pipeline";
import { redactImage } from "../src/extract/redact";
import { readWithGlimmer, secondOpinion, secondReaderModel, type SecondReading } from "../src/extract/secondReader";

process.loadEnvFile(join(import.meta.dirname, "..", ".env"));
const ROOT = join(import.meta.dirname, "..");
const SET = process.env.SET ?? "test";
const REPLAY = process.env.REPLAY;
if (!REPLAY) throw new Error("Set REPLAY to a saved eval run (eval/runs/<run>) holding Muse Spark's readings.");
const GLIMMER_REPLAY = process.env.GLIMMER_REPLAY; // re-score saved Glimmer readings without calling the model
if (!GLIMMER_REPLAY && !process.env.NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY is not set.");
const PACKS = join(ROOT, "synthetic", "generated", SET, "packs");
const ANSWERS = join(ROOT, "synthetic", "generated", SET, "answers");
const only = process.argv.slice(2);

const key = (f: Fact): string => {
  if (f.kind === "flight_leg") return `F|${f.directorId}|${f.originCode}|${f.destCode}|${f.departUtc}|${f.arriveUtc}`;
  if (f.kind === "hotel_stay") return `H|${f.directorId}|${f.placeCode}|${f.checkInUtc}|${f.checkOutUtc}`;
  return `C|${f.directorId}|${f.placeCode}|${f.source}`;
};
const docIdOf = (file: string) => file.split(/packs[\\/]/).pop()!.split("\\").join("/");

async function main() {
  const ids = readdirSync(PACKS).filter((d) => (only.length ? only.includes(d) : true)).sort();
  const outDir = join(ROOT, "eval", "runs", "glimmer-" + new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(outDir, { recursive: true });
  const tot = { meetings: 0, docs: 0, unread: 0, truth: 0, gMatched: 0, gSpurious: 0, gVerdictOk: 0, gUnsafePass: 0, sVerdictOk: 0, cVerdictOk: 0, cUnsafePass: 0, flagged: 0, flaggedCorrectly: 0, ms: 0 };
  const rows: any[] = [];

  for (const id of ids) {
    const ans = JSON.parse(readFileSync(join(ANSWERS, `${id}.json`), "utf8"));
    const spark: AnyExtract[] = JSON.parse(readFileSync(join(ROOT, "eval", "runs", REPLAY!, `${id}.raw.json`), "utf8"));
    const items = spark.map((r) => ({ docId: docIdOf(r.file), extraction: r.extraction, turnStartsMs: r.turnStartsMs }));
    const primary = decide(items, ans.company, ans.meeting, ans.scenario.jurisdiction);

    const docs = spark.filter((r) => !isRecording(r.file));
    const readings: SecondReading[] = GLIMMER_REPLAY
      ? JSON.parse(readFileSync(join(ROOT, "eval", "runs", GLIMMER_REPLAY, `${id}.glimmer.json`), "utf8"))
      : await pool(docs, 3, async (r) => {
      const docId = docIdOf(r.file);
      try {
        const path = IMAGE_EXT.test(r.file) ? (await redactImage(r.file)).path : r.file;
        const g = await readWithGlimmer(path);
        return { docId, extraction: g.extraction, ms: g.ms };
      } catch (e) {
        return { docId, error: (e as Error).message.slice(0, 200) };
      }
    });
    writeFileSync(join(outDir, `${id}.glimmer.json`), JSON.stringify(readings, null, 1));

    // 1) Glimmer alone (recordings keep Muse Spark's reading of the transcript, as in the app).
    const byDoc = new Map(readings.filter((r) => r.extraction).map((r) => [r.docId, r.extraction!]));
    const gItems = items.map((it) => (byDoc.has(it.docId) ? { ...it, extraction: byDoc.get(it.docId)! } : it));
    const gEval = decide(gItems, ans.company, ans.meeting, ans.scenario.jurisdiction);
    const truth = new Set((ans.facts as Fact[]).filter((f) => !f.cite.docId.endsWith(".wav")).map(key));
    const got = new Set(gEval.facts.facts.filter((f) => !f.cite.docId.endsWith(".wav")).map(key));
    const gMatched = [...truth].filter((k) => got.has(k)).length;
    const gSpurious = [...got].filter((k) => !truth.has(k));

    // 2) Combined: the app's verdict with the SECOND-READER check added.
    const so = secondOpinion(items, readings, ans.company, ans.meeting, ans.scenario.jurisdiction, { facts: primary.facts.facts, evaluation: primary.evaluation });
    const tests = [...primary.evaluation.tests, so.test];
    const combined = verdictFrom(tests, primary.evaluation.contradictions.length);
    const sparkRight = primary.evaluation.verdict === ans.expected.verdict;

    tot.meetings += 1;
    tot.docs += docs.length;
    tot.unread += so.unread.length;
    tot.truth += truth.size;
    tot.gMatched += gMatched;
    tot.gSpurious += gSpurious.length;
    tot.gVerdictOk += gEval.evaluation.verdict === ans.expected.verdict ? 1 : 0;
    if (gEval.evaluation.verdict === "PASS" && ans.expected.verdict !== "PASS") tot.gUnsafePass += 1;
    tot.sVerdictOk += sparkRight ? 1 : 0;
    tot.cVerdictOk += combined === ans.expected.verdict ? 1 : 0;
    if (combined === "PASS" && ans.expected.verdict !== "PASS") tot.cUnsafePass += 1;
    if (so.test.status === "fail") {
      tot.flagged += 1;
      // A flag is "correct" when Muse Spark's own reading had a fact wrong or missing in this meeting.
      const sparkGot = new Set(primary.facts.facts.map(key));
      if ([...new Set((ans.facts as Fact[]).map(key))].some((k) => !sparkGot.has(k))) tot.flaggedCorrectly += 1;
    }
    tot.ms += readings.reduce((a, r) => a + (r.ms ?? 0), 0);

    rows.push({ id, expected: ans.expected.verdict, spark: primary.evaluation.verdict, glimmer: gEval.evaluation.verdict, combined, check: so.test.status, glimmerFacts: `${gMatched}/${truth.size}`, spurious: gSpurious, agreed: `${so.agreed}/${so.total}`, disagreements: so.disagreements, changesDecision: so.changesDecision, unread: so.unread });
    console.log(`${id}  expected ${ans.expected.verdict.padEnd(6)} spark ${primary.evaluation.verdict.padEnd(6)} glimmer ${gEval.evaluation.verdict.padEnd(6)} combined ${combined.padEnd(6)} check ${so.test.status.padEnd(14)} glimmer facts ${gMatched}/${truth.size} unread ${so.unread.length}`);
  }

  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "n/a");
  const summary = {
    set: SET,
    secondReader: secondReaderModel(),
    primaryRun: REPLAY,
    runAt: new Date().toISOString(),
    meetings: tot.meetings,
    documentsReRead: tot.docs,
    documentsUnread: tot.unread,
    glimmerAlone: {
      factsExact: `${tot.gMatched}/${tot.truth} (${pct(tot.gMatched, tot.truth)})`,
      spuriousFacts: tot.gSpurious,
      meetingVerdictAgreement: `${tot.gVerdictOk}/${tot.meetings} (${pct(tot.gVerdictOk, tot.meetings)})`,
      wrongPass: tot.gUnsafePass,
    },
    museSparkAlone: { meetingVerdictAgreement: `${tot.sVerdictOk}/${tot.meetings}` },
    combined: {
      meetingVerdictAgreement: `${tot.cVerdictOk}/${tot.meetings} (${pct(tot.cVerdictOk, tot.meetings)})`,
      wrongPass: tot.cUnsafePass,
      meetingsSentToReviewBySecondReader: tot.flagged,
      ofWhichMuseSparkHadAFactWrong: tot.flaggedCorrectly,
    },
    avgSecondsPerDocument: +(tot.ms / Math.max(1, tot.docs - tot.unread) / 1000).toFixed(1),
    rows,
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SECOND READER ====");
  console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
  console.log("\nSaved in", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

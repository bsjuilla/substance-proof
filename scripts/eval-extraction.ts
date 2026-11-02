// Runs the Meta models over every synthetic pack, then scores the result against the hidden answers:
//  1) fact accuracy (was each flight / hotel stay / claim read exactly right?)
//  2) meeting-level agreement (does the rules engine reach the same verdict from the extracted facts?)
// Usage: SET=dev|test [REPLAY=<run>] npx tsx scripts/eval-extraction.ts [meetingId ...]
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fact } from "../src/engine/types";
import { makeClient } from "../src/extract/client";
import { decide, extractAny, pool, type AnyExtract } from "../src/extract/pipeline";

const ROOT = join(import.meta.dirname, "..");
const SET = process.env.SET ?? "dev"; // the published score uses SET=test (held out)
const PACKS = join(ROOT, "synthetic", "generated", SET, "packs");
const ANSWERS = join(ROOT, "synthetic", "generated", SET, "answers");
const only = process.argv.slice(2);
const REPLAY = process.env.REPLAY; // re-score a saved run for free (no model calls)

function listDocs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listDocs(p));
    else if (/\.(pdf|png|jpe?g|webp|wav)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const key = (f: Fact): string => {
  if (f.kind === "flight_leg") return `F|${f.directorId}|${f.originCode}|${f.destCode}|${f.departUtc}|${f.arriveUtc}`;
  if (f.kind === "hotel_stay") return `H|${f.directorId}|${f.placeCode}|${f.checkInUtc}|${f.checkOutUtc}`;
  return `C|${f.directorId}|${f.placeCode}|${f.source}`;
};

async function main() {
  const { client, model } = REPLAY ? { client: null as any, model: "replay:" + REPLAY } : makeClient();
  let commit = "unknown"; // a ZIP download has no git history
  try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }
  const ids = readdirSync(PACKS).filter((d) => (only.length ? only.includes(d) : true)).sort();
  const runDir = join(ROOT, "eval", "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });

  let totalCost = 0;
  const rows: any[] = [];
  const tot = { truth: 0, matched: 0, spurious: 0, rejected: 0, meetings: 0, verdictOk: 0, dirs: 0, dirsOk: 0, windowOk: 0, contrTruth: 0, contrFound: 0, unsafePass: 0, unsafePresent: 0 };

  for (const id of ids) {
    const ans = JSON.parse(readFileSync(join(ANSWERS, `${id}.json`), "utf8"));
    let results: AnyExtract[];
    if (REPLAY) {
      results = JSON.parse(readFileSync(join(ROOT, "eval", "runs", REPLAY, `${id}.raw.json`), "utf8"));
    } else {
      const names = ans.company.directors.map((d: any) => d.name);
      results = await pool(listDocs(join(PACKS, id)), 3, (d) => extractAny(client, model, d, { names }));
      writeFileSync(join(runDir, `${id}.raw.json`), JSON.stringify(results, null, 1));
    }
    totalCost += results.reduce((a, r) => a + r.costUsd, 0);

    const items = results.map((r) => ({
      docId: r.file.split(/packs[\\/]/).pop()!.split("\\").join("/"),
      extraction: r.extraction,
      turnStartsMs: r.turnStartsMs,
    }));
    const { facts, evaluation: ev } = decide(items, ans.company, ans.meeting, ans.scenario.jurisdiction);

    const truth = new Set((ans.facts as Fact[]).map(key));
    const got = new Set(facts.facts.map(key));
    const matched = [...truth].filter((k) => got.has(k)).length;
    const spurious = [...got].filter((k) => !truth.has(k));
    const missed = [...truth].filter((k) => !got.has(k));
    const w = facts.meetingWindow;
    const windowOk = !!w && w.startUtc === ans.meeting.startUtc && w.endUtc === ans.meeting.endUtc;
    const dirsOk = ans.expected.presence.filter((p: any) => ev.presence.find((q) => q.directorId === p.directorId)?.status === p.status).length;
    const contrTruth = ans.expected.contradictions.length;
    const contrFound = ans.expected.contradictions.filter((c: any) => ev.contradictions.some((q) => q.directorId === c.directorId)).length;

    tot.truth += truth.size; tot.matched += matched; tot.spurious += spurious.length; tot.rejected += facts.rejected.length;
    tot.meetings += 1; tot.verdictOk += ev.verdict === ans.expected.verdict ? 1 : 0;
    tot.dirs += ans.expected.presence.length; tot.dirsOk += dirsOk; tot.windowOk += windowOk ? 1 : 0;
    tot.contrTruth += contrTruth; tot.contrFound += contrFound;
    // Dangerous errors: saying PASS, or saying a director was present, when the truth says otherwise.
    if (ev.verdict === "PASS" && ans.expected.verdict !== "PASS") tot.unsafePass += 1;
    tot.unsafePresent += ans.expected.presence.filter((p: any) => p.status !== "present" && ev.presence.find((q) => q.directorId === p.directorId)?.status === "present").length;

    rows.push({ id, trap: ans.scenario.trap, style: ans.scenario.style, expected: ans.expected.verdict, got: ev.verdict, facts: `${matched}/${truth.size}`, missed, spurious, rejected: facts.rejected });
    console.log(`${id}  expected ${ans.expected.verdict.padEnd(6)} got ${ev.verdict.padEnd(6)} facts ${matched}/${truth.size}  spurious ${spurious.length}  rejected ${facts.rejected.length}`);
  }

  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "n/a");
  const summary = {
    set: SET, model, commit, runAt: new Date().toISOString(), meetings: tot.meetings, costUsd: +totalCost.toFixed(4),
    factsExact: `${tot.matched}/${tot.truth} (${pct(tot.matched, tot.truth)})`,
    spuriousFacts: tot.spurious, rejectedFacts: tot.rejected,
    meetingTimeCorrect: pct(tot.windowOk, tot.meetings),
    directorPresenceAgreement: `${tot.dirsOk}/${tot.dirs} (${pct(tot.dirsOk, tot.dirs)})`,
    meetingVerdictAgreement: `${tot.verdictOk}/${tot.meetings} (${pct(tot.verdictOk, tot.meetings)})`,
    contradictionsFound: `${tot.contrFound}/${tot.contrTruth}`,
    dangerousErrors: { wrongPass: tot.unsafePass, wronglyPresent: tot.unsafePresent },
    rows,
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SCOREBOARD ====");
  console.log({ ...summary, rows: undefined });
  for (const r of rows.filter((r) => r.missed.length || r.spurious.length || r.rejected.length || r.expected !== r.got)) {
    console.log("\nCHECK", r.id, r.trap, "\n missed:", r.missed, "\n spurious:", r.spurious, "\n rejected:", r.rejected);
  }
  console.log("\nRaw outputs saved in", runDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Builds rule packs with Muse Spark from the FULL official texts, validates them, and measures them:
// do AI-written packs (from raw law) reach the same law-level verdicts as the hand-written rules?
// Usage: npx tsx scripts/build-packs.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verdictFrom, evaluateMeeting } from "../src/engine/evaluate";
import { resolvePresence } from "../src/engine/presence";
import type { Company, Fact, Meeting } from "../src/engine/types";
import { makeClient } from "../src/extract/client";
import { buildPack, type BuildResult } from "../src/rules/buildPack";
import { runPack, type RulePack } from "../src/rules/pack";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "docs", "sources");
const OUT = join(ROOT, "web", "public", "rulepacks");

const htmlToText = (h: string) =>
  h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, "\n")
    .replace(/&#160;|&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function sourceText(name: string, url: string, sliceFrom?: RegExp): Promise<string> {
  const file = join(SRC, `${name}.txt`);
  let text: string;
  if (existsSync(file) && name !== "jersey-es-law") text = readFileSync(file, "utf8");
  else {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    text = htmlToText(await r.text());
  }
  // Drop site navigation before the main content, if a start marker is given.
  if (sliceFrom) {
    const i = text.search(sliceFrom);
    if (i > 0) text = text.slice(i);
  }
  mkdirSync(SRC, { recursive: true });
  writeFileSync(file, text);
  return text;
}

const SOURCES = [
  {
    code: "JE", name: "jersey-es-law", title: "Taxation (Companies – Economic Substance) (Jersey) Law 2019",
    url: "https://www.jerseylaw.je/laws/current/l_3_2019", sliceFrom: /Taxation \(Companies.{1,3}Economic Substance\) \(Jersey\) Law 2019\s*\n\s*Arrangement/,
  },
  {
    code: "SG", name: "iras-company-residency", title: "IRAS: Tax Residency of a Company / Certificate of Residence",
    url: "https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/tax-residency-of-a-company", sliceFrom: /Tax residency of a company|The tax residency of a company/i,
  },
];

function lawLevelVerdict(tests: ReturnType<typeof runPack>, contradictions: number) {
  return verdictFrom(tests.filter((t) => t.basis !== "guidance"), contradictions);
}

async function main() {
  // RECHECK=1: no model call. Re-measure the published packs (run 1) against the hand-written rules after an engine
  // change, and record the result next to the original runs.
  if (process.env.RECHECK) {
    const published = Object.fromEntries(SOURCES.map((s) => [s.code, JSON.parse(readFileSync(join(OUT, `${s.code}.json`), "utf8")) as BuildResult]));
    const { agreement, disagreements } = agreementFor(published);
    const file = join(ROOT, "eval", "results", "rulepack-agreement.json");
    const summary = JSON.parse(readFileSync(file, "utf8"));
    summary.recheck = { at: new Date().toISOString(), what: "published packs (run 1) re-measured after the presence rules changed", agreement, disagreements };
    writeFileSync(file, JSON.stringify(summary, null, 2));
    console.log({ recheck: agreement, disagreements });
    return;
  }
  const { client, model } = makeClient();
  mkdirSync(OUT, { recursive: true });
  const RUNS = Number(process.env.RUNS ?? 3);
  const texts: Record<string, string> = {};
  for (const s of SOURCES) texts[s.code] = await sourceText(s.name, s.url, s.sliceFrom);
  const runSummaries: { run: number; agreement: string; disagreements: any[]; tests: Record<string, string[]> }[] = [];
  let cost = 0;
  let published: Record<string, BuildResult & { sourceUrl: string; sourceChars: number }> = {};

  // Several independent runs: the model is not deterministic, so we measure how consistent it is.
  // Run 1 is the one published in the app (no cherry-picking); every run's agreement is reported.
  for (let run = 1; run <= RUNS; run++) {
    const built: Record<string, BuildResult & { sourceUrl: string; sourceChars: number }> = {};
    for (const s of SOURCES) {
      const text = texts[s.code];
      const res = await buildPack(client, model, s.title, text);
      cost += res.costUsd;
      built[s.code] = { ...res, sourceUrl: s.url, sourceChars: text.length };
      console.log(`\nrun ${run} ${s.code}: ${text.length.toLocaleString()} chars, ${res.inputTokens.toLocaleString()} tokens, ${res.seconds}s ($${res.costUsd.toFixed(4)})`);
      for (const v of res.validated) console.log(`  ${v.problems.length ? "REJECTED" : "ok      "} ${v.kind} [${v.applies_to}] ${v.citation}  "${v.quote.slice(0, 80)}"${v.problems.length ? "  <- " + v.problems.join("; ") : ""}`);
      if (run === 1) writeFileSync(join(OUT, `${s.code}.json`), JSON.stringify({ ...built[s.code], model, builtAt: new Date().toISOString() }, null, 1));
    }
    const { agreement, disagreements } = agreementFor(built);
    runSummaries.push({ run, agreement, disagreements, tests: Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.approvedTests.map((t) => `${t.kind}/${t.applies_to}`)])) });
    console.log(`  run ${run} law-level verdict agreement: ${agreement}`);
    if (run === 1) published = built;
  }

  const built = published;
  const summary = {
    model, builtAt: new Date().toISOString(), runs: RUNS, costUsd: +cost.toFixed(4),
    packs: Object.fromEntries(Object.entries(built).map(([k, v]) => [k, { proposed: v.validated.length, passedValidation: v.approvedTests.length, notSupported: v.pack.not_supported.length, inputTokens: v.inputTokens }])),
    lawLevelVerdictAgreement: runSummaries[0].agreement,
    perRun: runSummaries,
  };
  writeFileSync(join(ROOT, "eval", "results", "rulepack-agreement.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "index.json"), JSON.stringify({
    agreement: summary.lawLevelVerdictAgreement,
    perRun: runSummaries.map((r) => r.agreement),
    packs: SOURCES.map((s) => {
      const b = built[s.code];
      return { code: s.code, name: b.pack.jurisdiction_name, source: s.title, sourceUrl: s.url, sourceChars: b.sourceChars, inputTokens: b.inputTokens, seconds: b.seconds, costUsd: b.costUsd, proposed: b.validated.length, approved: b.approvedTests.length, notSupported: b.pack.not_supported.length };
    }),
  }, null, 1));
  console.log("\n==== AI-written rule packs vs hand-written rules (law/regulator-level verdicts) ====");
  console.log({ runs: RUNS, perRun: runSummaries.map((r) => r.agreement), costUsd: summary.costUsd });
}

// The hand-written engine vs an AI-written (validated) pack, law/regulator-level tests only, on every dev and
// held-out meeting, using the answer-key facts so that only the RULES are being compared.
function agreementFor(built: Record<string, BuildResult>) {
  const rows: any[] = [];
  for (const set of ["dev", "test"]) {
    const dir = join(ROOT, "synthetic", "generated", set, "answers");
    for (const f of readdirSync(dir).sort()) {
      const ans = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const j = ans.scenario.jurisdiction as "JE" | "SG";
      const company = ans.company as Company, meeting = ans.meeting as Meeting, facts = ans.facts as Fact[];
      const hand = evaluateMeeting(company, meeting, facts, j);
      const handLaw = verdictFrom(hand.tests.filter((t) => t.basis !== "guidance"), hand.contradictions.length);
      const pack: RulePack = { ...built[j].pack, tests: built[j].approvedTests };
      const presence = meeting.attendeeIds.map((id) => resolvePresence(id, meeting, facts, j, company.directors.find((d) => d.id === id)));
      const packTests = runPack(pack, company, meeting, presence);
      const packLaw = lawLevelVerdict(packTests, presence.filter((p) => p.contradiction || p.claimConflict).length);
      rows.push({ set, id: ans.scenario.id, j, hand: handLaw, pack: packLaw, agree: handLaw === packLaw });
    }
  }
  const agree = rows.filter((r) => r.agree).length;
  return { agreement: `${agree}/${rows.length}`, disagreements: rows.filter((r) => !r.agree) };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

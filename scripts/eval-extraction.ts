// Runs the model over every synthetic pack, then scores it against the hidden answers:
//  1) fact accuracy (did it read each flight / hotel stay / claim correctly?)
//  2) meeting-level agreement (does the rules engine reach the same verdict from the extracted facts?)
// Usage: npx tsx scripts/eval-extraction.ts [meetingId ...]
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { evaluateMeeting } from "../src/engine/evaluate";
import type { Fact } from "../src/engine/types";
import { makeClient } from "../src/extract/client";
import { extractDocument, type ExtractResult } from "../src/extract/extractDocument";
import { toFacts } from "../src/extract/toFacts";

const ROOT = join(import.meta.dirname, "..");
// SET=dev (default) or SET=test (the held-out set used for the published score)
const SET = process.env.SET ?? "dev";
const PACKS = join(ROOT, "synthetic", "generated", SET, "packs");
const ANSWERS = join(ROOT, "synthetic", "generated", SET, "answers");
const only = process.argv.slice(2);
// REPLAY=<run folder name> re-scores a saved run for free (no model calls).
const REPLAY = process.env.REPLAY;

function listDocs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listDocs(p));
    else if (/\.(pdf|png|jpg|jpeg|webp)$/i.test(name.name)) out.push(p);
  }
  return out;
}

const key = (f: Fact): string => {
  if (f.kind === "flight_leg") return `F|${f.directorId}|${f.originCode}|${f.destCode}|${f.departUtc}|${f.arriveUtc}`;
  if (f.kind === "hotel_stay") return `H|${f.directorId}|${f.placeCode}|${f.checkInUtc}|${f.checkOutUtc}`;
  return `C|${f.directorId}|${f.placeCode}`;
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function main() {
  const { client, model } = REPLAY ? ({ client: null as any, model: "replay:" + REPLAY }) : makeClient();
  const ids = readdirSync(PACKS).filter((d) => (only.length ? only.includes(d) : true)).sort();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(ROOT, "eval", "runs", stamp);
  mkdirSync(runDir, { recursive: true });

  let totalCost = 0;
  const rows: any[] = [];
  const tot = { truth: 0, matched: 0, spurious: 0, rejected: 0, meetings: 0, verdictOk: 0, dirs: 0, dirsOk: 0, windowOk: 0, contrTruth: 0, contrFound: 0 };

  for (const id of ids) {
    const ans = JSON.parse(readFileSync(join(ANSWERS, `${id}.json`), "utf8"));
    let results: ExtractResult[];
    if (REPLAY) {
      // Free: re-score a saved run without calling the model.
      results = JSON.parse(readFileSync(join(ROOT, "eval", "runs", REPLAY, `${id}.raw.json`), "utf8"));
    } else {
      const docs = listDocs(join(PACKS, id));
      results = await pool(docs, 3, (d) => extractDocument(client, model, d));
      writeFileSync(join(runDir, `${id}.raw.json`), JSON.stringify(results, null, 1));
    }
    totalCost += results.reduce((a, r) => a + r.costUsd, 0);

    const items = results.map((r) => ({
      docId: r.file.replace(PACKS + "\\", "").replace(/\\/g, "/"),
      extraction: r.extraction,
    }));
    const { facts, meetingWindow, rejected } = toFacts(items, ans.company.directors);

    const truth = new Set((ans.facts as Fact[]).map(key));
    const got = new Set(facts.map(key));
    const matched = [...truth].filter((k) => got.has(k)).length;
    const spurious = [...got].filter((k) => !truth.has(k));
    const missed = [...truth].filter((k) => !got.has(k));

    const meeting = { ...ans.meeting, ...(meetingWindow ?? {}) };
    const ev = evaluateMeeting(ans.company, meeting, facts, ans.scenario.jurisdiction);
    const windowOk = !!meetingWindow && meetingWindow.startUtc === ans.meeting.startUtc && meetingWindow.endUtc === ans.meeting.endUtc;
    const dirsOk = ans.expected.presence.filter((p: any) => ev.presence.find((q) => q.directorId === p.directorId)?.status === p.status).length;
    const contrTruth = ans.expected.contradictions.length;
    const contrFound = ans.expected.contradictions.filter((c: any) => ev.contradictions.some((q) => q.directorId === c.directorId)).length;

    tot.truth += truth.size; tot.matched += matched; tot.spurious += spurious.length; tot.rejected += rejected.length;
    tot.meetings += 1; tot.verdictOk += ev.verdict === ans.expected.verdict ? 1 : 0;
    tot.dirs += ans.expected.presence.length; tot.dirsOk += dirsOk; tot.windowOk += windowOk ? 1 : 0;
    tot.contrTruth += contrTruth; tot.contrFound += contrFound;

    rows.push({ id, trap: ans.scenario.trap, expected: ans.expected.verdict, got: ev.verdict, facts: `${matched}/${truth.size}`, spurious: spurious.length, rejected: rejected.length, missed, spuriousKeys: spurious, rejectedWhy: rejected });
    console.log(`${id}  expected ${ans.expected.verdict.padEnd(6)} got ${ev.verdict.padEnd(6)} facts ${matched}/${truth.size}  spurious ${spurious.length}  rejected ${rejected.length}`);
  }

  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "n/a");
  const summary = {
    model, meetings: tot.meetings, costUsd: +totalCost.toFixed(4),
    factRecall: pct(tot.matched, tot.truth), spuriousFacts: tot.spurious, rejectedFacts: tot.rejected,
    meetingWindowCorrect: pct(tot.windowOk, tot.meetings),
    perDirectorPresenceAgreement: pct(tot.dirsOk, tot.dirs),
    meetingVerdictAgreement: pct(tot.verdictOk, tot.meetings),
    contradictionsFound: `${tot.contrFound}/${tot.contrTruth}`,
    rows,
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SCOREBOARD ====");
  console.log({ ...summary, rows: undefined });
  const bad = rows.filter((r) => r.missed.length || r.spuriousKeys.length || r.rejected || r.expected !== r.got);
  for (const r of bad) console.log("\nCHECK", r.id, r.trap, "\n missed:", r.missed, "\n spurious:", r.spuriousKeys, "\n rejected:", r.rejectedWhy);
  console.log("\nRaw outputs saved in", runDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

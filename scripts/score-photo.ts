// Scores the reader on a Muse Image test set (scripts/photograph-set.ts) against the SAME answer key as the template set.
// Only the AI-made documents are read again; every other file (the minutes, untouched documents) is taken from the
// published run, so the difference is caused by the new images alone. Hard cost cap; stops before crossing it.
// Usage: SET=test-photo BASE_RUN=published-test-2026-11-01 CAP_USD=1.50 npx tsx scripts/score-photo.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fact } from "../src/engine/types";
import { makeClient } from "../src/extract/client";
import { decide, extractAny, type AnyExtract } from "../src/extract/pipeline";
import { CostCap, parseAudit } from "./lib/photoSet";

const ROOT = join(import.meta.dirname, "..");
const SET = process.env.SET ?? "test-photo";
const BASE_RUN = process.env.BASE_RUN ?? "published-test-2026-11-01";
const REPLAY = process.env.REPLAY; // re-score a saved photo run for free
const RESUME = process.env.RESUME; // continue a run that stopped at its cost cap: meetings already read are reused, not paid for again
const cap = new CostCap(Number(process.env.CAP_USD ?? 1.5));
const PER_DOC_ESTIMATE = 0.02; // a document read costs ~$0.01-0.02 (README: $0.03-0.09 per meeting of 3-6 files)
const OUT = join(ROOT, "synthetic", "generated", SET);

const key = (f: Fact): string =>
  f.kind === "flight_leg" ? `F|${f.directorId}|${f.originCode}|${f.destCode}|${f.departUtc}|${f.arriveUtc}`
  : f.kind === "hotel_stay" ? `H|${f.directorId}|${f.placeCode}|${f.checkInUtc}|${f.checkOutUtc}`
  : `C|${f.directorId}|${f.placeCode}|${f.source}`;
const norm = (p: string) => p.split("\\").join("/").split(/packs\//).pop()!;

async function main() {
  const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
  const auditFile = join(OUT, "audit.csv");
  const audit = existsSync(auditFile) ? parseAudit(readFileSync(auditFile, "utf8")) : new Map();
  const unaudited = manifest.entries.filter((e: any) => e.ok && !audit.get(e.output)).length;
  if (unaudited && !process.env.ALLOW_UNAUDITED) throw new Error(`${unaudited} AI-made images have no text audit yet. Fill ${SET}/audit.csv first (or ALLOW_UNAUDITED=1 for a dry look; do not publish that).`);
  const byOutput = new Map<string, any>(manifest.entries.filter((e: any) => e.ok).map((e: any) => [e.output, e]));
  const { client, model } = REPLAY ? { client: null as any, model: "replay" } : makeClient();
  const runDir = join(ROOT, "eval", "runs", REPLAY ?? RESUME ?? `${SET}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(runDir, { recursive: true });

  const ids = readdirSync(join(OUT, "packs")).sort();
  const scopes = { all: newTot(), textKept: newTot() }; // textKept: only meetings whose AI images all passed the audit
  const rows: any[] = [];
  let stopped = false;
  for (const id of ids) {
    const ans = JSON.parse(readFileSync(join(OUT, "answers", `${id}.json`), "utf8"));
    const base: AnyExtract[] = JSON.parse(readFileSync(join(ROOT, "eval", "runs", BASE_RUN, `${id}.raw.json`), "utf8"));
    const aiFiles = [...byOutput.keys()].filter((o) => o.startsWith(`${id}/`));
    const replaced = new Set(aiFiles.map((o) => byOutput.get(o).source));
    let fresh: AnyExtract[];
    if (REPLAY || (RESUME && existsSync(join(runDir, `${id}.raw.json`)))) fresh = JSON.parse(readFileSync(join(runDir, `${id}.raw.json`), "utf8"));
    else {
      fresh = [];
      for (const o of aiFiles) {
        if (!cap.canSpend(PER_DOC_ESTIMATE)) { stopped = true; break; }
        const names = ans.company.directors.map((d: any) => d.name);
        const r = await extractAny(client, model, join(OUT, "packs", o), { names });
        cap.add(r.costUsd);
        fresh.push(r);
      }
      if (stopped) { console.log(`cap reached at $${cap.spent.toFixed(3)} before ${id}; stopping (scored meetings so far are kept)`); break; }
      writeFileSync(join(runDir, `${id}.raw.json`), JSON.stringify(fresh, null, 1));
    }
    const kept = base.filter((r) => !replaced.has(norm(r.file)));
    const items = [...kept, ...fresh].map((r) => ({ docId: norm(r.file), extraction: r.extraction, turnStartsMs: r.turnStartsMs }));
    const { facts, evaluation: ev } = decide(items, ans.company, ans.meeting, ans.scenario.jurisdiction);
    const truth = new Set((ans.facts as Fact[]).map(key));
    const got = new Set(facts.facts.map(key));
    const r = {
      id, aiImages: aiFiles.length,
      textChanged: aiFiles.filter((o) => audit.get(o) === "yes"),
      factsMatched: [...truth].filter((k) => got.has(k)).length, factsTruth: truth.size,
      missed: [...truth].filter((k) => !got.has(k)), spurious: [...got].filter((k) => !truth.has(k)).length,
      dirsOk: ans.expected.presence.filter((p: any) => ev.presence.find((q) => q.directorId === p.directorId)?.status === p.status).length,
      dirs: ans.expected.presence.length, expected: ans.expected.verdict, got: ev.verdict,
      wrongPass: ev.verdict === "PASS" && ans.expected.verdict !== "PASS" ? 1 : 0,
      wronglyPresent: ans.expected.presence.filter((p: any) => p.status !== "present" && ev.presence.find((q) => q.directorId === p.directorId)?.status === "present").length,
    };
    rows.push(r);
    add(scopes.all, r);
    if (!r.textChanged.length) add(scopes.textKept, r);
    console.log(`${id} ai ${r.aiImages}  expected ${r.expected.padEnd(6)} got ${r.got.padEnd(6)} facts ${r.factsMatched}/${r.factsTruth}${r.textChanged.length ? "  (image changed text: " + r.textChanged.join(" ") + ")" : ""}`);
  }
  const fmt = (t: Tot) => ({ meetings: t.meetings, facts: `${t.fm}/${t.ft}`, directors: `${t.dOk}/${t.d}`, verdicts: `${t.vOk}/${t.meetings}`, dangerous: { wrongPass: t.wp, wronglyPresent: t.wpres } });
  const summary = {
    set: SET, mode: manifest.mode, imageModel: manifest.model, readerModel: model, baseRun: BASE_RUN, runAt: new Date().toISOString(),
    aiImages: byOutput.size, imageFailures: manifest.entries.filter((e: any) => !e.ok).length,
    audit: { textChanged: [...audit.values()].filter((v) => v === "yes").length, textKept: [...audit.values()].filter((v) => v === "no").length },
    imageCostUsd: manifest.costUsd, readCostUsd: +cap.spent.toFixed(4), stoppedAtCap: stopped,
    all: fmt(scopes.all), auditedTextKept: fmt(scopes.textKept), rows,
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(ROOT, "eval", "results", `${SET}-summary.json`), JSON.stringify(summary, null, 2));
  console.log("\n==== AI-made documents vs template documents (same answer key) ====");
  console.log({ ...summary, rows: undefined });
  console.log(`cost: images $${manifest.costUsd} + reading $${cap.spent.toFixed(4)} = $${(manifest.costUsd + cap.spent).toFixed(4)}`);
}

type Tot = { meetings: number; fm: number; ft: number; dOk: number; d: number; vOk: number; wp: number; wpres: number };
function newTot(): Tot { return { meetings: 0, fm: 0, ft: 0, dOk: 0, d: 0, vOk: 0, wp: 0, wpres: 0 }; }
function add(t: Tot, r: any) { t.meetings++; t.fm += r.factsMatched; t.ft += r.factsTruth; t.dOk += r.dirsOk; t.d += r.dirs; t.vOk += r.expected === r.got ? 1 : 0; t.wp += r.wrongPass; t.wpres += r.wronglyPresent; }

main().catch((e) => { console.error(e); process.exit(1); });

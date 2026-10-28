// Runs the FULL live pipeline (Muse Spark + Voice Transcribe + agent) on chosen sample packs and saves the
// result + documents into web/public/demo/, so the public demo can replay real runs without an API key.
// Usage: npx tsx scripts/record-demo.ts dev:m11 dev:m03 test:t14 ...
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzePack } from "../src/app/analyze";
import { makeClient } from "../src/extract/client";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "web", "public", "demo");
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["dev:m11", "dev:m03", "dev:m10", "test:t14"];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : /\.(pdf|png|jpe?g|webp|wav)$/i.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const { client, model } = makeClient();
const index: { id: string; title: string; trap: string; verdict: string; jurisdiction: string }[] = [];
let total = 0;
for (const t of targets) {
  const [set, id] = t.split(":");
  const packs = join(ROOT, "synthetic", "generated", set, "packs");
  const ans = JSON.parse(readFileSync(join(ROOT, "synthetic", "generated", set, "answers", `${id}.json`), "utf8"));
  const files = listFiles(join(packs, id));
  const res = await analyzePack({
    client, model, id, files, packRoot: packs,
    company: ans.company, meeting: ans.meeting, jurisdiction: ans.scenario.jurisdiction,
    onProgress: (m) => console.log(`  ${id}: ${m}`),
  });
  res.mode = "replay";
  total += res.costUsd;
  const dest = join(OUT, id);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(packs, id), join(dest, "files", id), { recursive: true });
  writeFileSync(join(dest, "result.json"), JSON.stringify(res, null, 1));
  index.push({ id, title: ans.company.name, trap: ans.scenario.trap, verdict: res.evaluation.verdict, jurisdiction: ans.scenario.jurisdiction });
  console.log(`${id}: ${res.evaluation.verdict} (expected ${ans.expected.verdict})  $${res.costUsd}  ${res.seconds}s  drafts ${res.agent?.drafts.length ?? 0}`);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(`\nSaved ${index.length} recorded runs to ${OUT}. Total cost $${total.toFixed(4)}`);

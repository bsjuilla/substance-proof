// Scores an independent labeller's CSV against (1) the answer key and (2) the system's latest test-set run.
// Usage: npx tsx scripts/score-labels.ts path/to/labels.csv
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decide } from "../src/extract/pipeline";

const ROOT = join(import.meta.dirname, "..");
const csvPath = process.argv[2];
if (!csvPath) throw new Error("Pass the labeller's CSV path");
const ANS = join(ROOT, "synthetic", "generated", "test", "answers");
const runs = join(ROOT, "eval", "runs");
// The published run the README numbers come from, unless another is given (RUN=<folder in eval/runs>); else the newest complete one.
const complete = (r: string) => existsSync(join(runs, r, "t01.raw.json")) && existsSync(join(runs, r, "t30.raw.json"));
const wanted = process.env.RUN ?? "published-test-2026-11-01";
const run = complete(wanted) ? wanted : readdirSync(runs).sort().reverse().find(complete);

const map: Record<string, string> = { present: "yes", absent: "no", unknown: "cannot_tell" };
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z_]/g, "");
const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim());
let n = 0, humanVsKey = 0, humanVsSystem = 0, systemVsKey = 0;
const disagreements: string[] = [];
for (const line of lines) {
  const [meeting, director, , answerRaw] = line.split(",");
  const answer = norm(answerRaw ?? "");
  if (!["yes", "no", "cannot_tell"].includes(answer)) continue;
  const ans = JSON.parse(readFileSync(join(ANS, `${meeting.trim()}.json`), "utf8"));
  const d = ans.company.directors.find((x: any) => x.name === director.trim());
  if (!d) continue;
  const key = map[ans.expected.presence.find((p: any) => p.directorId === d.id)?.status ?? "unknown"];
  let sys = "n/a";
  if (run) {
    const raw = JSON.parse(readFileSync(join(runs, run, `${meeting.trim()}.raw.json`), "utf8"));
    const items = raw.map((r: any) => ({ docId: r.file.split(/packs[\\/]/).pop().split("\\").join("/"), extraction: r.extraction, turnStartsMs: r.turnStartsMs }));
    const { evaluation } = decide(items, ans.company, ans.meeting, ans.scenario.jurisdiction);
    sys = map[evaluation.presence.find((p) => p.directorId === d.id)?.status ?? "unknown"];
  }
  n++;
  if (answer === key) humanVsKey++; else disagreements.push(`${meeting} ${director}: labeller=${answer} key=${key} system=${sys}`);
  if (answer === sys) humanVsSystem++;
  if (sys === key) systemVsKey++;
}
const pct = (a: number) => (n ? ((100 * a) / n).toFixed(1) + "%" : "n/a");
console.log(`Rows scored: ${n}   (system run: ${run ?? "none"})`);
console.log(`Labeller vs answer key:  ${humanVsKey}/${n} (${pct(humanVsKey)})`);
console.log(`Labeller vs system:      ${humanVsSystem}/${n} (${pct(humanVsSystem)})`);
console.log(`System vs answer key:    ${systemVsKey}/${n} (${pct(systemVsKey)})`);
if (disagreements.length) console.log("\nWhere the labeller differs from the key:\n" + disagreements.join("\n"));

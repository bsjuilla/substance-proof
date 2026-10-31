// Recomputes the answer keys after a rule change, without re-rendering any document: the scenarios are rebuilt
// from the same seeds, each answer's `expected` comes from the independent oracle again, and the documents (and so
// every saved model reading) stay exactly as they were. Prints every meeting whose expected verdict changed.
// Usage: npx tsx scripts/rekey.ts [dev|test|stress ...]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateMeeting } from "../src/engine/evaluate";
import { oracle } from "./oracle";
import { SCENARIOS } from "./scenarios";
import { buildTestScenarios } from "./testset";

const ROOT = join(import.meta.dirname, "..", "synthetic", "generated");
const sets = process.argv.slice(2).length ? process.argv.slice(2) : ["dev", "test", "stress"];
const pick = (set: string) => (set === "test" ? buildTestScenarios() : set === "stress" ? buildTestScenarios(424242, 12, true) : SCENARIOS);

for (const set of sets) {
  let changed = 0;
  let disagree = 0;
  for (const s of pick(set)) {
    const file = join(ROOT, set, "answers", `${s.id}.json`);
    if (!existsSync(file)) continue;
    const ans = JSON.parse(readFileSync(file, "utf8"));
    // The documents must be the ones this scenario produced: same meeting and travel facts.
    if (JSON.stringify(ans.meeting) !== JSON.stringify(s.meeting)) throw new Error(`${set}/${s.id}: scenario no longer matches its documents`);
    const expected = { ...oracle(s), source: "independent oracle (scripts/oracle.ts)" };
    const engineOnTruth = evaluateMeeting(s.company, s.meeting, ans.facts, s.jurisdiction);
    if (engineOnTruth.verdict !== expected.verdict) {
      disagree += 1;
      console.warn(`  !! ${set}/${s.id}: engine on true facts says ${engineOnTruth.verdict}, oracle says ${expected.verdict}`);
    }
    if (ans.expected.verdict !== expected.verdict) {
      changed += 1;
      console.log(`${set}/${s.id}: ${ans.expected.verdict} -> ${expected.verdict}  (${s.trap})`);
    }
    writeFileSync(file, JSON.stringify({ ...ans, company: s.company, expected }, null, 2));
  }
  console.log(`${set}: ${changed} expected verdict(s) changed; engine-on-truth vs oracle: ${disagree} disagreement(s)\n`);
}

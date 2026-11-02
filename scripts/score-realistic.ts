// Scores the realistic set (eval/realistic: packs written by an outside reviewer, with answers registered before each
// run) from the saved results, before and after the 1 November changes. Free: no model is called.
// Usage: npx tsx scripts/score-realistic.ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "eval", "realistic");
const ids = readdirSync(ROOT).filter((d) => /^A/.test(d)).sort(); // A = realistic meetings; B = attacks

function score(file: string) {
  let dirs = 0, dirsOk = 0, verdictOk = 0, wronglyPresent = 0, wrongPass = 0;
  const misses: string[] = [];
  for (const id of ids) {
    const f = join(ROOT, id, file);
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, "utf8"));
    const ans = JSON.parse(readFileSync(join(ROOT, id, "answer.json"), "utf8"));
    const got = Object.fromEntries(r.evaluation.presence.map((p: any) => [p.directorId, p.status]));
    for (const [d, exp] of Object.entries(ans.presence)) {
      dirs++;
      if (got[d] === exp) dirsOk++;
      else misses.push(`${id} ${d}: expected ${exp}, got ${got[d]}`);
      if (got[d] === "present" && exp !== "present") wronglyPresent++;
    }
    if (r.evaluation.verdict === ans.verdict) verdictOk++;
    else misses.push(`${id} verdict: expected ${ans.verdict}, got ${r.evaluation.verdict}`);
    if (r.evaluation.verdict === "PASS" && ans.verdict !== "PASS") wrongPass++;
  }
  return { directors: `${dirsOk}/${dirs}`, verdicts: `${verdictOk}/${ids.length}`, wronglyPresent, wrongPass, misses };
}

for (const [label, file] of [["before (31 Oct code and instructions)", "result-before.json"], ["after (1 Nov)", "result-after.json"]]) {
  const s = score(file);
  console.log(`\n${label}: directors ${s.directors}, verdicts ${s.verdicts}, directors wrongly present ${s.wronglyPresent}, wrong EVIDENCED ${s.wrongPass}`);
  for (const m of s.misses) console.log("  " + m);
}

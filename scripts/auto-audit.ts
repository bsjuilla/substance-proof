// A cheap first pass of the text audit for the Muse Image photo set. A person (or the builder's assistant) still has to
// look at every image this marks "needs a look"; images it marks "no" are ones where the reader, reading ONLY the AI
// photo, recovered exactly the facts in the answer key for that document (flights: airports and times; hotel stays:
// place and dates). If a printed time, date, name or airport had been changed by the image model, those facts could
// not all match, so the text that matters did not change. This does not prove that unrelated text (a booking
// reference, a hotel address) stayed the same: say so wherever the result is reported.
// Usage: SET=test-photo RUN=<folder in eval/runs> npx tsx scripts/auto-audit.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fact } from "../src/engine/types";
import { toFacts } from "../src/extract/toFacts";

const ROOT = join(import.meta.dirname, "..");
const SET = process.env.SET ?? "test-photo";
const RUN = process.env.RUN;
if (!RUN) throw new Error("Set RUN to the photo run folder in eval/runs (the one score-photo.ts wrote).");
const OUT = join(ROOT, "synthetic", "generated", SET);
const key = (f: Fact): string =>
  f.kind === "flight_leg" ? `F|${f.directorId}|${f.originCode}|${f.destCode}|${f.departUtc}|${f.arriveUtc}`
  : f.kind === "hotel_stay" ? `H|${f.directorId}|${f.placeCode}|${f.checkInUtc}|${f.checkOutUtc}`
  : `C|${f.directorId}|${f.placeCode}|${f.source}`;
const norm = (p: string) => p.split("\\").join("/").split(/packs\//).pop()!;

const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
const rows = ["file,text_changed,notes"];
let auto = 0, look = 0;
const lookAt: string[] = [];
for (const e of manifest.entries.filter((x: any) => x.ok)) {
  const id = e.output.split("/")[0];
  const raw = join(ROOT, "eval", "runs", RUN, `${id}.raw.json`);
  if (!existsSync(raw)) { rows.push(`${e.output},,not read yet`); continue; }
  const ans = JSON.parse(readFileSync(join(OUT, "answers", `${id}.json`), "utf8"));
  const read = (JSON.parse(readFileSync(raw, "utf8")) as any[]).find((r) => norm(r.file) === e.output);
  if (!read) { rows.push(`${e.output},,reader output missing`); look++; lookAt.push(e.output); continue; }
  const got = new Set(toFacts([{ docId: e.output, extraction: read.extraction }], ans.company.directors, { refUtc: ans.meeting.startUtc }).facts.map(key));
  const truth = new Set((ans.facts as Fact[]).filter((f) => f.cite.docId === e.source).map(key));
  const same = truth.size > 0 && [...truth].every((k) => got.has(k)) && [...got].every((k) => truth.has(k));
  if (same) { rows.push(`${e.output},no,auto: reader recovered exactly the ${truth.size} answer-key fact(s)`); auto++; }
  else { rows.push(`${e.output},,needs a look: truth ${truth.size} fact(s), reader got ${got.size}`); look++; lookAt.push(e.output); }
}
writeFileSync(join(OUT, "audit.csv"), rows.join("\n") + "\n");
console.log(`auto-audited as text kept: ${auto}; need a look: ${look}`);
for (const f of lookAt) console.log("  look at:", f);

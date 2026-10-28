// Free debugging: re-score a saved run without calling the model.
// Usage: npx tsx scripts/replay.ts <runFolderName|latest> <meetingId>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateMeeting } from "../src/engine/evaluate";
import { toFacts } from "../src/extract/toFacts";

const ROOT = join(import.meta.dirname, "..");
const runs = join(ROOT, "eval", "runs");
const arg = process.argv[2];
const run = !arg || arg === "latest" ? readdirSync(runs).sort().pop()! : arg;
const id = process.argv[3] ?? "m01";
const raw = JSON.parse(readFileSync(join(runs, run, `${id}.raw.json`), "utf8"));
const SET = process.env.SET ?? "dev";
const ans = JSON.parse(readFileSync(join(ROOT, "synthetic", "generated", SET, "answers", `${id}.json`), "utf8"));
const toDocId = (p: string) => p.split(/packs[\\/]/).pop()!.split("\\").join("/");
const items = raw.map((r: any) => ({ docId: toDocId(r.file), extraction: r.extraction }));
const { facts, meetingWindow, rejected } = toFacts(items, ans.company.directors);
console.log("run", run);
console.log("window", meetingWindow, "| truth", ans.meeting.startUtc, ans.meeting.endUtc);
console.log("rejected", rejected);
const ev = evaluateMeeting(ans.company, { ...ans.meeting, ...(meetingWindow ?? {}) }, facts, ans.scenario.jurisdiction);
console.log("GOT     ", ev.verdict, ev.presence.map((p) => `${p.directorId}:${p.status}`).join(" "));
console.log("EXPECTED", ans.expected.verdict, ans.expected.presence.map((p: any) => `${p.directorId}:${p.status}`).join(" "));
for (const t of ev.tests) console.log("  test", t.id, t.status, "-", t.detail);
for (const p of ev.presence) console.log("  presence", p.directorId, p.status, "-", p.reason);

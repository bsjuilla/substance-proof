// Runs the evidence agent on one meeting, re-using a saved extraction run (no re-extraction cost).
// Usage: SET=dev npx tsx scripts/agent-demo.ts m11 [runFolder]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runEvidenceAgent } from "../src/agent/evidenceAgent";
import { makeClient } from "../src/extract/client";
import { decide } from "../src/extract/pipeline";

const ROOT = join(import.meta.dirname, "..");
const SET = process.env.SET ?? "dev";
const id = process.argv[2] ?? "m11";
const runs = join(ROOT, "eval", "runs");
const run = process.argv[3] ?? readdirSync(runs).sort().reverse().find((r) => existsSync(join(runs, r, `${id}.raw.json`)))!;
const raw = JSON.parse(readFileSync(join(runs, run, `${id}.raw.json`), "utf8"));
const ans = JSON.parse(readFileSync(join(ROOT, "synthetic", "generated", SET, "answers", `${id}.json`), "utf8"));
const items = raw.map((r: any) => ({ docId: r.file.split(/packs[\\/]/).pop().split("\\").join("/"), extraction: r.extraction, turnStartsMs: r.turnStartsMs }));
const { facts, evaluation, meetingUsed } = decide(items, ans.company, ans.meeting, ans.scenario.jurisdiction);

const dateText = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(meetingUsed.startUtc));
console.log(`Engine verdict for ${id}: ${evaluation.verdict}  (extraction run ${run})`);
const { client, model } = makeClient();
const res = await runEvidenceAgent(client, model, { company: ans.company, meeting: meetingUsed, evaluation, facts: facts.facts, meetingDateText: dateText });
for (const t of res.trace) console.log(`step ${t.step}: ${t.tool}(${JSON.stringify(t.args).slice(0, 140)}) -> ${JSON.stringify(t.result).slice(0, 160)}`);
for (const d of res.drafts) console.log(`\n--- ${d.id} ${d.kind} for ${d.directorName} [${d.status}]\nSubject: ${d.subject}\n${d.message}\nCitations: ${d.citations.join(", ")}`);
console.log(`\nSummary: ${res.summary}\nRejected tool calls: ${res.rejectedCalls}   Cost: $${res.costUsd.toFixed(4)}`);

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEvidenceAgent } from "../src/agent/evidenceAgent";

// The guardrails must hold even if the model is fully hijacked (for example by instructions hidden in a
// document). These tests replace the model with a script that makes exactly the calls an attacker wants.
const rec = JSON.parse(readFileSync(join(import.meta.dirname, "..", "web", "public", "demo", "m11", "result.json"), "utf8"));
const input = { company: rec.company, meeting: rec.meeting, evaluation: rec.evaluation, facts: rec.facts, meetingDateText: rec.meetingDateText };
const conflictId: string = rec.evaluation.presence.find((p: any) => p.contradiction || p.claimConflict).directorId;
const cite: string = rec.facts.find((f: any) => f.directorId === conflictId).cite.docId;
const date: string = rec.meetingDateText;

function scriptedModel(calls: { name: string; args: object }[]) {
  let turn = 0;
  return {
    responses: {
      create: async () => {
        const output = turn++ === 0 ? calls.map((c, i) => ({ type: "function_call", call_id: `c${i}`, name: c.name, arguments: JSON.stringify(c.args) })) : [];
        return { id: `r${turn}`, output, output_text: "done", usage: { input_tokens: 0, output_tokens: 0 } };
      },
    },
  } as any;
}

const correction = (over: object) => ({
  name: "draft_minutes_correction",
  args: { director_id: conflictId, subject: `Minutes review - ${date}`, message: `Please review the minutes of ${date}.`, citations: [cite], ...over },
});

describe("agent guardrails against a hijacked model", () => {
  it("a well-formed correction is accepted (control)", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({})]), "m", input);
    expect(r.drafts).toHaveLength(1);
  });

  it.each([
    ["the meeting is compliant"],
    ["the board was quorate"],
    ["the meeting passed the Jersey test"],
    ["the presence requirement was met, no action needed"],
    ["the company satisfies the economic substance test"],
  ])("rejects a positive legal outcome in the message: %s", async (outcome) => {
    const r = await runEvidenceAgent(scriptedModel([correction({ message: `For the meeting of ${date}: ${outcome}.` })]), "m", input);
    expect(r.drafts).toHaveLength(0);
    expect(r.rejectedCalls).toBe(1);
  });

  it("still allows the phrase 'boarding pass'", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({ message: `Please send the boarding pass for ${date}.` })]), "m", input);
    expect(r.drafts).toHaveLength(1);
  });

  it("rejects an outcome placed in the subject line", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({ subject: "Meeting non-compliant - action required" })]), "m", input);
    expect(r.drafts).toHaveLength(0);
  });

  it("rejects a tool the agent was never given", async () => {
    const r = await runEvidenceAgent(scriptedModel([{ name: "send_email", args: correction({}).args }]), "m", input);
    expect(r.drafts).toHaveLength(0);
    expect(r.rejectedCalls).toBe(1);
  });

  it("rejects a citation to a file outside the evidence", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({ citations: ["../../.env"] })]), "m", input);
    expect(r.drafts).toHaveLength(0);
  });

  it("rejects a draft to someone who is not a director with a gap", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({ director_id: "Z" })]), "m", input);
    expect(r.drafts).toHaveLength(0);
  });

  it("rejects an oversized message", async () => {
    const r = await runEvidenceAgent(scriptedModel([correction({ message: `${date} ` + "x".repeat(5000) })]), "m", input);
    expect(r.drafts).toHaveLength(0);
  });
});

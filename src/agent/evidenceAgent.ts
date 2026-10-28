import type OpenAI from "openai";
import { costUsd } from "../extract/client";
import type { Company, Fact, Meeting, MeetingEvaluation } from "../engine/types";

// The evidence agent. Muse Spark looks at the gaps the RULES ENGINE found (it never decides pass or fail),
// then uses tools to draft requests for missing evidence and corrections to inaccurate minutes.
// Every tool call is validated by code, and every draft waits for a human to approve it. Nothing is sent.

export type Draft = {
  id: string;
  kind: "evidence_request" | "minutes_correction";
  directorId: string;
  directorName: string;
  subject: string;
  message: string;
  documents?: string[];
  citations: string[];
  status: "awaiting_approval";
};

export type AgentTrace = { step: number; tool: string; args: unknown; result: unknown }[];

export type AgentResult = { drafts: Draft[]; summary: string; trace: AgentTrace; costUsd: number; rejectedCalls: number };

const TOOLS = [
  {
    type: "function",
    name: "list_gaps",
    description: "List the directors whose presence the rules engine could not prove, or whose minutes entry contradicts the evidence or the recording. Call this first.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_rule_result",
    description: "Get the result, legal citation and detail of one rule test from the engine, by its id (for example JE-quorum).",
    parameters: { type: "object", properties: { test_id: { type: "string" } }, required: ["test_id"], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "draft_evidence_request",
    description: "Draft (do not send) a polite request to a director for documents proving where they were during the meeting. Only for directors listed by list_gaps with missing evidence. A human must approve it.",
    parameters: {
      type: "object",
      properties: {
        director_id: { type: "string" },
        documents_requested: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        message: { type: "string", description: "Email text. Must state the meeting date. Must not say whether any legal test was met." },
        citations: { type: "array", items: { type: "string" }, description: "docIds from list_gaps that explain the gap" },
      },
      required: ["director_id", "documents_requested", "subject", "message", "citations"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "draft_minutes_correction",
    description: "Draft (do not send) a note to the company secretary that the minutes' record of a director's location conflicts with the evidence or the recording, asking them to review it. Only for directors with a contradiction or conflict from list_gaps.",
    parameters: {
      type: "object",
      properties: {
        director_id: { type: "string" },
        subject: { type: "string" },
        message: { type: "string", description: "Must quote what the minutes say and what the evidence shows, with the document names. Must not say whether any legal test was met." },
        citations: { type: "array", items: { type: "string" } },
      },
      required: ["director_id", "subject", "message", "citations"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

const SYSTEM = `You are an evidence assistant for a company secretary. A deterministic rules engine has already assessed a board meeting.
You do NOT decide whether any legal test is met and must never say so. Your job:
1. Call list_gaps.
2. For each director with missing or claim-only evidence, call draft_evidence_request once (ask for a boarding pass, travel itinerary or hotel bill covering the meeting date).
3. For each director whose minutes entry conflicts with the evidence or with the recording, call draft_minutes_correction once, quoting both sides with document names.
4. When done, reply with a two-sentence plain summary of the drafts you prepared.
Keep messages short, factual and polite. Address people by their full name only, never with a title such as Mr or Ms. Use the meeting date exactly as given. Quote the exact words from "quotes" (in quotation marks) and name the document each comes from. Never invent documents, words or facts.`;

export async function runEvidenceAgent(
  client: OpenAI,
  model: string,
  input: { company: Company; meeting: Meeting; evaluation: MeetingEvaluation; facts: Fact[]; meetingDateText: string },
): Promise<AgentResult> {
  const { company, evaluation, facts, meetingDateText } = input;
  const nameOf = (id: string) => company.directors.find((d) => d.id === id)?.name ?? id;
  const docIds = new Set(facts.map((f) => f.cite.docId));

  const gaps = evaluation.presence
    .filter((p) => p.status === "unknown" || p.contradiction || p.claimConflict)
    .map((p) => ({
      director_id: p.directorId,
      name: nameOf(p.directorId),
      status: p.status,
      basis: p.basis,
      engine_reason: p.reason,
      contradiction: p.contradiction ?? null,
      minutes_vs_recording: p.claimConflict ? { minutes: p.claimConflict.minutes, recording: p.claimConflict.recording } : null,
      documents: p.cites.map((c) => c.docId + (c.timestampSec != null ? `@${c.timestampSec}s` : c.page ? `#p${c.page}` : "")),
      // Exact words from each source, so drafts can quote them instead of paraphrasing.
      quotes: [...p.cites, ...(p.claimConflict?.cites ?? [])]
        .filter((c, i, all) => c.quote && all.findIndex((x) => x.docId === c.docId && x.quote === c.quote) === i)
        .map((c) => ({ doc: c.docId, words: c.quote })),
    }));
  const gapIds = new Set(gaps.map((g) => g.director_id));
  const conflictIds = new Set(gaps.filter((g) => g.contradiction || g.minutes_vs_recording).map((g) => g.director_id));
  const missingIds = new Set(gaps.filter((g) => g.status === "unknown").map((g) => g.director_id));

  const drafts: Draft[] = [];
  const trace: AgentTrace = [];
  let rejectedCalls = 0;
  let cost = 0;
  let summary = "";

  const validCites = (cs: unknown) =>
    Array.isArray(cs) && cs.length > 0 && cs.every((c) => typeof c === "string" && docIds.has(c.split(/[@#]/)[0]));

  // Deterministic guardrails on every tool call.
  function execute(name: string, args: any): unknown {
    if (name === "list_gaps") return { meeting_date: meetingDateText, jurisdiction: evaluation.jurisdiction, gaps };
    if (name === "get_rule_result") {
      const t = evaluation.tests.find((x) => x.id === args?.test_id);
      return t ?? { error: `unknown test id; valid ids: ${evaluation.tests.map((x) => x.id).join(", ")}` };
    }
    const id = String(args?.director_id ?? "");
    const already = drafts.some((d) => d.directorId === id && d.kind === (name === "draft_evidence_request" ? "evidence_request" : "minutes_correction"));
    const problems: string[] = [];
    if (!gapIds.has(id)) problems.push("director is not in list_gaps");
    if (already) problems.push("a draft of this kind already exists for this director");
    if (typeof args?.message !== "string" || !args.message.includes(meetingDateText)) problems.push(`message must state the meeting date exactly as "${meetingDateText}"`);
    // ("pass" is not banned: "boarding pass" is a normal phrase.)
    if (/\b(fail(s|ed|ure)?|non-?compliant|breach(es|ed)?|not quorate|inquorate)\b/i.test(String(args?.message ?? ""))) problems.push("message must not state any legal outcome");
    if (!validCites(args?.citations)) problems.push("citations must be docIds returned by list_gaps");
    if (name === "draft_evidence_request" && !missingIds.has(id)) problems.push("evidence requests are only for directors whose presence is unproven");
    if (name === "draft_minutes_correction" && !conflictIds.has(id)) problems.push("minutes corrections are only for directors with a contradiction or conflict");
    if (problems.length) {
      rejectedCalls++;
      return { rejected: true, problems };
    }
    const draft: Draft = {
      id: `D${drafts.length + 1}`,
      kind: name === "draft_evidence_request" ? "evidence_request" : "minutes_correction",
      directorId: id,
      directorName: nameOf(id),
      subject: String(args.subject),
      message: String(args.message),
      documents: name === "draft_evidence_request" ? (args.documents_requested as string[]) : undefined,
      citations: args.citations as string[],
      status: "awaiting_approval",
    };
    drafts.push(draft);
    return { draft_id: draft.id, status: "awaiting_approval" };
  }

  let previous: string | undefined;
  let nextInput: any = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Company: ${company.name}. Meeting date: ${meetingDateText}. Prepare the drafts.` },
  ];
  for (let step = 1; step <= 10; step++) {
    const r: any = await client.responses.create({
      model,
      max_output_tokens: 4000,
      reasoning: { effort: "low" },
      tools: TOOLS as any,
      ...(previous ? { previous_response_id: previous } : {}),
      input: nextInput,
    });
    cost += costUsd(r.usage);
    previous = r.id;
    const calls = (r.output ?? []).filter((o: any) => o.type === "function_call");
    if (calls.length === 0) {
      summary = r.output_text ?? "";
      break;
    }
    nextInput = calls.map((c: any) => {
      let args: unknown = {};
      try {
        args = JSON.parse(c.arguments || "{}");
      } catch {
        args = { __unparseable: c.arguments };
      }
      const result = execute(c.name, args);
      trace.push({ step, tool: c.name, args, result });
      return { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) };
    });
  }
  return { drafts, summary, trace, costUsd: cost, rejectedCalls };
}

import { relative, sep } from "node:path";
import type OpenAI from "openai";
import { runEvidenceAgent, type AgentResult } from "../agent/evidenceAgent";
import type { Jurisdiction } from "../engine/evaluate";
import type { Company, Fact, Meeting, MeetingEvaluation } from "../engine/types";
import { decide, extractAny, pool, type AnyExtract } from "../extract/pipeline";

export type DocKind = "minutes" | "boarding_pass" | "hotel_folio" | "recording" | "other";

/** Everything the UI needs to show one analysed meeting. Also written to disk for the replay demo. */
export type RunResult = {
  id: string;
  createdAt: string;
  model: string;
  mode: "live" | "replay";
  company: Company;
  jurisdiction: Jurisdiction;
  meeting: Meeting;
  meetingDateText: string;
  docs: { docId: string; kind: DocKind; transcript?: { startMs: number; endMs: number; text: string; speaker?: string }[] }[];
  facts: Fact[];
  rejected: { file: string; reason: string }[];
  evaluation: MeetingEvaluation;
  agent?: Omit<AgentResult, "costUsd">;
  costUsd: number;
  seconds: number;
};

const ZONE: Record<Jurisdiction, string> = { JE: "Europe/Jersey", SG: "Asia/Singapore" };

export function meetingDateText(meeting: Meeting, j: Jurisdiction): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: ZONE[j] }).format(new Date(meeting.startUtc));
}

function kindOf(x: AnyExtract): DocKind {
  if (x.transcript) return "recording";
  const t = x.extraction.document_type;
  return t === "minutes" || t === "boarding_pass" || t === "hotel_folio" ? t : "other";
}

export async function analyzePack(opts: {
  client: OpenAI;
  model: string;
  id: string;
  files: string[]; // absolute paths
  packRoot: string; // docIds are paths relative to this folder's parent, e.g. "m11/minutes.pdf"
  company: Company;
  meeting: Meeting; // startUtc/endUtc are replaced by what the minutes say
  jurisdiction: Jurisdiction;
  withAgent?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<RunResult> {
  const t0 = Date.now();
  const names = opts.company.directors.map((d) => d.name);
  let done = 0;
  const extracts = await pool(opts.files, 3, async (f) => {
    const r = await extractAny(opts.client, opts.model, f, { names });
    opts.onProgress?.(`Read ${++done}/${opts.files.length}: ${f.split(/[\\/]/).pop()}`);
    return r;
  });
  const rel = (p: string) => relative(opts.packRoot, p).split(sep).join("/");
  const items = extracts.map((x) => ({ docId: rel(x.file), extraction: x.extraction, turnStartsMs: x.turnStartsMs }));
  const { facts, evaluation, meetingUsed } = decide(items, opts.company, opts.meeting, opts.jurisdiction);
  if (!facts.meetingWindow) facts.rejected.push({ file: "minutes", reason: "Meeting date and time could not be read from the minutes; the setup times were used." });
  const dateText = meetingDateText(meetingUsed, opts.jurisdiction);

  let agent: AgentResult | undefined;
  if (opts.withAgent !== false) {
    opts.onProgress?.("Agent: preparing evidence requests");
    agent = await runEvidenceAgent(opts.client, opts.model, { company: opts.company, meeting: meetingUsed, evaluation, facts: facts.facts, meetingDateText: dateText });
  }
  const { costUsd: agentCost = 0, ...agentRest } = agent ?? ({} as AgentResult);
  return {
    id: opts.id,
    createdAt: new Date().toISOString(),
    model: opts.model,
    mode: "live",
    company: opts.company,
    jurisdiction: opts.jurisdiction,
    meeting: meetingUsed,
    meetingDateText: dateText,
    docs: extracts.map((x) => ({
      docId: rel(x.file),
      kind: kindOf(x),
      transcript: x.transcript?.turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs, text: t.transcript, speaker: t.speaker })),
    })),
    facts: facts.facts,
    rejected: facts.rejected,
    evaluation,
    agent: agent ? (agentRest as Omit<AgentResult, "costUsd">) : undefined,
    costUsd: +(extracts.reduce((a, x) => a + x.costUsd, 0) + agentCost).toFixed(4),
    seconds: Math.round((Date.now() - t0) / 1000),
  };
}

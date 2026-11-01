import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import type OpenAI from "openai";
import { runEvidenceAgent, type AgentResult } from "../agent/evidenceAgent";
import type { Jurisdiction } from "../engine/evaluate";
import type { Company, Fact, Meeting, MeetingEvaluation } from "../engine/types";
import { decide, extractAny, pool, type AnyExtract } from "../extract/pipeline";
import { verdictFrom } from "../engine/evaluate";
import { runPack, type RulePack } from "../rules/pack";
import { discardRedacted, type Redaction } from "../extract/redact";
import { readWithGlimmer, secondOpinion, secondReaderAvailable, type SecondReaderResult, type SecondReading } from "../extract/secondReader";

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
  /** sha256: fingerprint of the file exactly as supplied, so a reviewer can show later which file was checked. */
  docs: { docId: string; kind: DocKind; sha256?: string; transcript?: { startMs: number; endMs: number; text: string; speaker?: string }[]; redactions?: Redaction[] }[];
  facts: Fact[];
  rejected: { file: string; reason: string }[];
  evaluation: MeetingEvaluation;
  agent?: Omit<AgentResult, "costUsd">;
  costUsd: number;
  seconds: number;
  /** Set when the verdict came from an AI-written rule pack instead of the hand-written rules. */
  rulePack?: { jurisdiction: string; source: string };
  /** Muse Glimmer's independent reading of the same documents, when an NVIDIA key is configured. */
  secondReader?: Omit<SecondReaderResult, "test">;
  /** What produced this result, for the evidence memo: engine and rule versions, and every model that read the pack. */
  provenance?: { engine: string; rules: string; models: string[] };
};

const ENGINE_VERSION = (() => {
  try {
    return `Substance Proof ${JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version}`;
  } catch {
    return "Substance Proof";
  }
})();
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

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
  /** Optional approved rule pack (e.g. written by Muse Spark from the law) to use instead of the hand-written rules. */
  pack?: RulePack;
  /** Ask Muse Glimmer for an independent second reading (default: when NVIDIA_API_KEY is set). */
  secondReader?: boolean;
}): Promise<RunResult> {
  const t0 = Date.now();
  const names = opts.company.directors.map((d) => d.name);
  const rel = (p: string) => relative(opts.packRoot, p).split(sep).join("/");
  const useSecond = opts.secondReader ?? secondReaderAvailable();
  // Muse Glimmer starts on each document as soon as Muse Spark has finished with it, and sees the same file
  // (for photos, the copy SAM 3.1 redacted). Recordings are heard by Voice Transcribe only.
  const second: Promise<SecondReading>[] = [];
  let done = 0;
  let secondDone = 0;
  const extracts = await pool(opts.files, 3, async (f) => {
    const r = await extractAny(opts.client, opts.model, f, { names });
    opts.onProgress?.(`Read ${++done}/${opts.files.length}: ${f.split(/[\\/]/).pop()}`);
    if (useSecond && !r.transcript) {
      const docId = rel(f);
      second.push(
        readWithGlimmer(r.readPath).then(
          (g) => (opts.onProgress?.(`Second reader ${++secondDone}: ${docId}`), { docId, extraction: g.extraction, ms: g.ms }),
          (e) => ({ docId, error: (e as Error).message.slice(0, 200) }),
        ),
      );
    }
    return r;
  });
  const items = extracts.map((x) => ({ docId: rel(x.file), extraction: x.extraction, turnStartsMs: x.turnStartsMs }));
  const decided = decide(items, opts.company, opts.meeting, opts.jurisdiction);
  const { facts, meetingUsed } = decided;
  let evaluation = decided.evaluation;
  if (opts.pack) {
    // Use an approved, AI-written rule pack instead of the hand-written rules (same presence inference).
    // Keep the meeting-time evidence check alongside the pack's legal tests.
    const tests = [...runPack(opts.pack, opts.company, meetingUsed, evaluation.presence), ...evaluation.tests.filter((t) => t.basis === "evidence")];
    evaluation = { ...evaluation, tests, verdict: verdictFrom(tests, evaluation.contradictions.length) };
  }
  let secondReader: SecondReaderResult | undefined;
  if (second.length) {
    opts.onProgress?.("Waiting for the second reader (Muse Glimmer)");
    secondReader = secondOpinion(items, await Promise.all(second), opts.company, opts.meeting, opts.jurisdiction, { facts: facts.facts, evaluation });
    const tests = [...evaluation.tests, secondReader.test];
    evaluation = { ...evaluation, tests, verdict: verdictFrom(tests, evaluation.contradictions.length) };
  }
  // Both readers are done with the blacked-out copies of the photos: delete them now rather than leave them in temp.
  for (const x of extracts) if (x.readPath !== x.file) discardRedacted(x.readPath);
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
      sha256: sha256(x.file),
      transcript: x.transcript?.turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs, text: t.transcript, speaker: t.speaker })),
      redactions: x.redactions,
    })),
    facts: facts.facts,
    rejected: facts.rejected,
    evaluation,
    agent: agent ? (agentRest as Omit<AgentResult, "costUsd">) : undefined,
    costUsd: +(extracts.reduce((a, x) => a + x.costUsd, 0) + agentCost).toFixed(4),
    seconds: Math.round((Date.now() - t0) / 1000),
    secondReader: secondReader ? (({ test: _t, ...rest }) => rest)(secondReader) : undefined,
    rulePack: opts.pack ? { jurisdiction: opts.pack.jurisdiction_code, source: opts.pack.source_title } : undefined,
    provenance: {
      engine: ENGINE_VERSION,
      rules: opts.pack ? `Rule pack written by ${opts.model} from "${opts.pack.source_title}", approved by the user` : `Hand-written rules for ${opts.jurisdiction === "JE" ? "Jersey" : "Singapore"} (src/engine/rules)`,
      models: [
        `${opts.model} (reads documents${opts.withAgent !== false ? ", drafts requests" : ""})`,
        ...(extracts.some((x) => x.transcript) ? ["muse-voice-transcribe-1.0 (recordings)"] : []),
        ...(extracts.some((x) => x.redactions !== undefined) ? ["sam-3.1 (finds personal data to black out in photos)"] : []),
        ...(secondReader ? [`${secondReader.model} (independent second reader)`] : []),
      ],
    },
  };
}

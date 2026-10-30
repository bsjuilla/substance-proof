import { extname } from "node:path";
import type OpenAI from "openai";
import { evaluateMeeting, verdictFrom, type Jurisdiction } from "../engine/evaluate";
import type { Company, Meeting, MeetingEvaluation, TestResult } from "../engine/types";
import { extractDocument } from "./extractDocument";
import type { Extraction } from "./schema";
import { toFacts, type ExtractedItem, type ToFactsResult } from "./toFacts";
import { extractFromTranscript, transcribeRecording, type Transcript } from "./transcribe";
import { redactImage, type Redaction } from "./redact";

/** Audio or video recordings of the meeting (any length; converted and split as needed). */
export const RECORDING_EXT = /\.(wav|mp3|m4a|mp4|webm|ogg)$/i;
export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
export const isRecording = (path: string) => RECORDING_EXT.test(path);

export type AnyExtract = {
  file: string;
  extraction: Extraction;
  costUsd: number;
  ms: number;
  usage?: { input_tokens: number; output_tokens: number; reasoning_tokens: number };
  /** Images only: what SAM 3.1 blacked out before the image was read (boxes in source pixels). */
  redactions?: Redaction[];
  /** Present for recordings. */
  transcript?: Transcript;
  turnStartsMs?: number[];
};

/** Reads one file of a meeting pack with the right Meta model: Muse Spark for documents and images,
 *  Muse Voice Transcribe + Muse Spark for recordings. */
export async function extractAny(client: OpenAI, model: string, path: string, opts: { names?: string[]; redact?: boolean } = {}): Promise<AnyExtract> {
  const t0 = Date.now();
  if (isRecording(path)) {
    // Vocabulary hints: the directors' names (from the company setup) and the places that matter.
    const keywords = [...(opts.names ?? []), "St Helier", "Jersey", "Singapore", "Dubai"];
    const tr = await transcribeRecording(path, { keywords });
    const ex = await extractFromTranscript(client, model, tr.result);
    return {
      file: path,
      extraction: ex.extraction,
      costUsd: tr.costUsd + ex.costUsd,
      ms: Date.now() - t0,
      transcript: tr.result,
      turnStartsMs: tr.result.turns.map((t) => t.startMs),
    };
  }
  // Photos and scans: SAM 3.1 blacks out barcodes, faces and signatures first; Muse Spark reads only that copy.
  let readPath = path;
  let redactions: Redaction[] | undefined;
  let redactionCost = 0;
  if (opts.redact !== false && IMAGE_EXT.test(path)) {
    try {
      const red = await redactImage(path);
      readPath = red.path;
      redactions = red.redactions;
      redactionCost = red.costUsd;
    } catch (e) {
      // Without redaction the image is not sent at all: privacy is not silently skipped.
      throw new Error(`Redaction failed for ${path}, so it was not sent to the reader: ${(e as Error).message}`);
    }
  }
  const r = await extractDocument(client, model, readPath);
  return { file: path, extraction: r.extraction, costUsd: r.costUsd + redactionCost, ms: Date.now() - t0, usage: r.usage, redactions };
}

export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/** Deterministic part: extracted items -> facts -> rules engine verdict. */
export function decide(
  items: ExtractedItem[],
  company: Company,
  meeting: Meeting,
  jurisdiction: Jurisdiction,
): { facts: ToFactsResult; evaluation: MeetingEvaluation; meetingUsed: Meeting } {
  const facts = toFacts(items, company.directors);
  // The minutes are written by the party that wants a PASS, so they do not get to choose the meeting window.
  // When the scheduled time is known (calendar or user), presence is judged at that time and the minutes are
  // checked against it. Only when nobody supplied it do the minutes set the window, and that is flagged.
  const meetingUsed = meeting.scheduleUnknown ? { ...meeting, ...(facts.meetingWindow ?? {}) } : meeting;
  const timing = timingTest(meeting, facts.meetingWindow);
  const base = evaluateMeeting(company, meetingUsed, facts.facts, jurisdiction);
  const tests = [...base.tests, timing];
  return { facts, evaluation: { ...base, tests, verdict: verdictFrom(tests, base.contradictions.length) }, meetingUsed };
}

const MAX_TIME_DIFF_MIN = 15;

/** Do the minutes record the meeting at the time it was actually scheduled? */
export function timingTest(meeting: Meeting, fromMinutes: { startUtc: string; endUtc: string } | undefined): TestResult {
  const base = { id: "MEETING-TIME", label: "Minutes record the scheduled meeting time", basis: "evidence" as const, citation: "Evidence check (not a legal test)" };
  if (meeting.scheduleUnknown) {
    return { ...base, status: "inconclusive", detail: "No scheduled time was given, so the time printed in the minutes was used without an independent check." };
  }
  if (!fromMinutes) return { ...base, status: "inconclusive", detail: "The meeting time could not be read from the minutes." };
  const d = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;
  const off = Math.max(d(meeting.startUtc, fromMinutes.startUtc), d(meeting.endUtc, fromMinutes.endUtc));
  if (off > MAX_TIME_DIFF_MIN) {
    const hm = (iso: string) => iso.slice(11, 16);
    return { ...base, status: "fail", detail: `The minutes say ${hm(fromMinutes.startUtc)}–${hm(fromMinutes.endUtc)} UTC; the scheduled time was ${hm(meeting.startUtc)}–${hm(meeting.endUtc)} UTC. Presence was judged at the scheduled time.` };
  }
  return { ...base, status: "pass", detail: "The time in the minutes matches the scheduled time." };
}

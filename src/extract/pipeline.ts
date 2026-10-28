import { extname } from "node:path";
import type OpenAI from "openai";
import { evaluateMeeting, type Jurisdiction } from "../engine/evaluate";
import type { Company, Meeting, MeetingEvaluation } from "../engine/types";
import { extractDocument } from "./extractDocument";
import type { Extraction } from "./schema";
import { toFacts, type ExtractedItem, type ToFactsResult } from "./toFacts";
import { extractFromTranscript, transcribeWav, type Transcript } from "./transcribe";

export type AnyExtract = {
  file: string;
  extraction: Extraction;
  costUsd: number;
  ms: number;
  usage?: { input_tokens: number; output_tokens: number; reasoning_tokens: number };
  /** Present for recordings. */
  transcript?: Transcript;
  turnStartsMs?: number[];
};

/** Reads one file of a meeting pack with the right Meta model: Muse Spark for documents and images,
 *  Muse Voice Transcribe + Muse Spark for recordings. */
export async function extractAny(client: OpenAI, model: string, path: string, opts: { names?: string[] } = {}): Promise<AnyExtract> {
  const t0 = Date.now();
  if (extname(path).toLowerCase() === ".wav") {
    // Vocabulary hints: the directors' names (from the company setup) and the places that matter.
    const keywords = [...(opts.names ?? []), "St Helier", "Jersey", "Singapore", "Dubai"];
    const tr = await transcribeWav(path, { keywords });
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
  const r = await extractDocument(client, model, path);
  return { file: path, extraction: r.extraction, costUsd: r.costUsd, ms: r.ms, usage: r.usage };
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
  const meetingUsed = { ...meeting, ...(facts.meetingWindow ?? {}) };
  return { facts, evaluation: evaluateMeeting(company, meetingUsed, facts.facts, jurisdiction), meetingUsed };
}

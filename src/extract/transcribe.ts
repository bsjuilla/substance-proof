import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type OpenAI from "openai";
import { costUsd } from "./client";
import { EXTRACTION_JSON_SCHEMA, ExtractionSchema, type Extraction } from "./schema";

// Muse Voice Transcribe (file endpoint). WAV must be mono 16-bit PCM at 16 or 24 kHz, at most 10 minutes.
// Docs: https://dev.meta.ai/docs/speech-to-text  Price: $0.18 per audio hour.

export type Turn = { turnId?: number; startMs: number; endMs: number; transcript: string; speaker?: string };
export type Transcript = { transcript: string; audioDurationMs: number; turns: Turn[] };

export async function transcribeWav(path: string, opts: { keywords?: string[] } = {}): Promise<{ result: Transcript; costUsd: number }> {
  const key = process.env.META_API_KEY;
  if (!key) throw new Error("META_API_KEY missing");
  const base = (process.env.META_API_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const form = new FormData();
  const request = {
    mode: "DIARIZATION",
    model: "muse-voice-transcribe-1.0",
    audioEncoding: "WAV",
    languageBias: ["English"],
    ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
  };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([readFileSync(path)], { type: "audio/wav" }), basename(path));
  const res = await fetch(`${base}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, body: form });
  if (!res.ok) throw new Error(`Voice Transcribe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const result = (await res.json()) as Transcript;
  const seconds = Math.floor((result.audioDurationMs ?? 0) / 1000);
  return { result, costUsd: (seconds / 3600) * 0.18 };
}

const TRANSCRIPT_PROMPT = `You read the TRANSCRIPT of a company board meeting recording. Turns are numbered.
Report, for each person who says where THEY THEMSELVES are during the meeting, one claimed_location fact:
- person_name: the name they give (as spoken). If a person speaks without giving their name, skip them.
- place: the place they say they are in (for example "St Helier", "Dubai", "the airport in London").
- quote: their exact words from the transcript.
- page: the turn number the statement is in.
Use null for every other field. Do not report places that people only mention in passing (for example a flight destination) unless they say they are there now.
Set document_type to "other" and all meeting fields to null. Report nothing else.`;

export async function extractFromTranscript(client: OpenAI, model: string, t: Transcript): Promise<{ extraction: Extraction; costUsd: number }> {
  const numbered = t.turns.map((x, i) => `[${i + 1}] (${(x.startMs / 1000).toFixed(1)}s${x.speaker ? `, speaker ${x.speaker}` : ""}) ${x.transcript}`).join("\n");
  const r: any = await client.responses.create({
    store: false, // ask Meta not to keep the response (board packs hold personal data)
    model,
    max_output_tokens: 4000,
    reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "transcript_claims", strict: true, schema: EXTRACTION_JSON_SCHEMA as any } },
    input: [
      { role: "system", content: TRANSCRIPT_PROMPT },
      { role: "user", content: numbered || "(empty transcript)" },
    ],
  });
  return { extraction: ExtractionSchema.parse(JSON.parse(r.output_text)), costUsd: costUsd(r.usage) };
}

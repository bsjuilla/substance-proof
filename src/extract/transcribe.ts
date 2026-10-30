import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import ffmpegPath from "ffmpeg-static";
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

/** Longest piece sent in one request (the file endpoint takes at most 10 minutes). */
const CHUNK_S = 570;

/** Any recording (WAV, MP3, M4A, MP4, WebM…) of any length: converted to mono 16 kHz WAV with the bundled ffmpeg,
 *  split into pieces under 10 minutes, transcribed piece by piece, and stitched back onto one timeline. Speaker
 *  labels restart in each piece (the service does not carry them across requests), so they are kept per piece
 *  ("2·A") rather than guessed; the roll-call claims rely on what people say, not on the labels. */
export async function transcribeRecording(path: string, opts: { keywords?: string[] } = {}): Promise<{ result: Transcript; costUsd: number }> {
  const work = mkdtempSync(join(tmpdir(), "sp-audio-"));
  try {
    const ff = ffmpegPath as unknown as string;
    const wav = join(work, "all.wav");
    execFileSync(ff, ["-loglevel", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav]);
    const seconds = (statSync(wav).size - 44) / (16000 * 2);
    const parts: string[] = [];
    if (seconds <= CHUNK_S + 15) parts.push(wav);
    else {
      execFileSync(ff, ["-loglevel", "error", "-y", "-i", wav, "-f", "segment", "-segment_time", String(CHUNK_S), "-c", "copy", join(work, "part%03d.wav")]);
      parts.push(...readdirSync(work).filter((f) => f.startsWith("part")).sort().map((f) => join(work, f)));
    }
    const turns: Turn[] = [];
    const texts: string[] = [];
    let cost = 0;
    let offsetMs = 0;
    for (const [i, part] of parts.entries()) {
      const r = await transcribeWav(part, opts);
      cost += r.costUsd;
      for (const t of r.result.turns) {
        turns.push({ ...t, startMs: t.startMs + offsetMs, endMs: t.endMs + offsetMs, speaker: t.speaker && parts.length > 1 ? `${i + 1}·${t.speaker}` : t.speaker });
      }
      texts.push(r.result.transcript);
      offsetMs += r.result.audioDurationMs || ((statSync(part).size - 44) / 32);
    }
    return { result: { transcript: texts.join(" "), audioDurationMs: offsetMs, turns }, costUsd: cost };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const TRANSCRIPT_PROMPT =`You read the TRANSCRIPT of a company board meeting recording. Turns are numbered.
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

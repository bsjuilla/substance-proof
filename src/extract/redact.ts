import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import ffmpegPath from "ffmpeg-static";

// Privacy before reading: SAM 3.1 finds the parts of a photographed document that hold personal data the check
// does not need (the boarding-pass barcode encodes name and booking reference; faces; signatures). ffmpeg blacks
// them out, and only the redacted copy is sent to Muse Spark. Docs: https://dev.meta.ai/docs/sam/reading-segmentation

export type Redaction = { label: string; x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number };

/** What to look for. Each is one SAM 3.1 call ($2.50 per 1,000 images, dev.meta.ai pricing, 30 Oct 2026). */
export const REDACT_PROMPTS = ["qr code", "barcode", "face", "handwritten signature"];
export const SAM_PRICE_PER_IMAGE = 0.0025;
const MIN_CONFIDENCE = 0.5;

/** Parse SAM's special-token output: "<0f>0<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|><|mask;...|>,1<|box;...". */
export function parseSamBoxes(text: string, label: string): Redaction[] {
  const out: Redaction[] = [];
  for (const m of text.matchAll(/<\|box;([^|]*)\|>/g)) {
    const f = Object.fromEntries(m[1].split(";").map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)]));
    if ([f.x1, f.y1, f.x2, f.y2, f.w, f.h].some((v) => !Number.isFinite(v))) continue;
    if (f.c !== undefined && f.c < MIN_CONFIDENCE) continue;
    out.push({ label, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, w: f.w, h: f.h, c: f.c });
  }
  return out;
}

async function segment(imageDataUrl: string, prompt: string): Promise<Redaction[]> {
  const base = (process.env.META_API_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      store: false,
      metadata: { include_confidence: "true" },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl }] }],
    }),
  });
  if (!res.ok) throw new Error(`SAM 3.1 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  const text = j.output_text ?? j.output?.flatMap((o: any) => o.content ?? []).map((c: any) => c.text ?? "").join("") ?? "";
  return parseSamBoxes(text, prompt);
}

/** Finds and blacks out personal data on an image. Returns the path to send to the reader (the original when
 *  nothing was found), the boxes, and the cost. Never throws for a SAM failure: the caller decides. */
export async function redactImage(path: string): Promise<{ path: string; redactions: Redaction[]; costUsd: number }> {
  const ext = extname(path).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  const found = (await Promise.all(REDACT_PROMPTS.map((p) => segment(dataUrl, p)))).flat();
  const costUsd = REDACT_PROMPTS.length * SAM_PRICE_PER_IMAGE;
  if (!found.length) return { path, redactions: [], costUsd };
  const pad = 4;
  const boxes = found.map((b) => `drawbox=x=${Math.max(0, b.x1 - pad)}:y=${Math.max(0, b.y1 - pad)}:w=${b.x2 - b.x1 + 2 * pad}:h=${b.y2 - b.y1 + 2 * pad}:color=black:t=fill`);
  const out = join(mkdtempSync(join(tmpdir(), "sp-redact-")), basename(path, ext) + ".redacted" + (ext === ".webp" ? ".png" : ext));
  execFileSync(ffmpegPath as unknown as string, ["-loglevel", "error", "-y", "-i", path, "-vf", boxes.join(","), "-frames:v", "1", out]);
  return { path: out, redactions: found, costUsd };
}

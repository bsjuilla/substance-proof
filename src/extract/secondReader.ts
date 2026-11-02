import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, sep } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Jurisdiction } from "../engine/evaluate";
import type { Company, Fact, Meeting, MeetingEvaluation, TestResult } from "../engine/types";
import { decide, pool } from "./pipeline";
import { EXTRACTION_JSON_SCHEMA, ExtractionSchema, SYSTEM_PROMPT, type Extraction } from "./schema";
import { toFacts, type ExtractedItem } from "./toFacts";

// A second, independent reader: Muse Glimmer 30B, Meta's open-weight model (Apache 2.0), here served through
// NVIDIA's API catalog (build.nvidia.com). It reads every document from scratch as an image, with the same
// instructions as Muse Spark; code then compares the two readings fact by fact. Any disagreement becomes an
// evidence check that sends the meeting to REVIEW, so the open-weight model can only make the result more careful.

const BASE = "https://integrate.api.nvidia.com/v1";
export const secondReaderModel = () => process.env.GLIMMER_MODEL || "meta/muse-glimmer-30b";
export const secondReaderAvailable = () => !!process.env.NVIDIA_API_KEY;

// The same instructions as Muse Spark (including the e-ticket line, which Glimmer needed first), plus the schema,
// because this endpoint takes the schema in the prompt.
const SYSTEM =
  SYSTEM_PROMPT +
  "\n\nReturn ONLY one JSON object (no prose, no code fences) that validates against this JSON Schema:\n" +
  JSON.stringify(EXTRACTION_JSON_SCHEMA);

/** Longest side of a rendered page, in pixels. An A4 page at the normal scale is about 1,350; a PDF that declares a
 *  page 200 inches wide would otherwise ask for a canvas of several gigabytes. */
const MAX_PAGE_PX = 2000;

/** The 14 standard PDF fonts shipped with pdf.js (the trailing slash matters). */
const STANDARD_FONTS = join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "standard_fonts") + sep;

/** PDF pages drawn to PNG, so scanned (image-only) pages are read the same way as born-digital ones. Up to 8 pages: a
 *  board pack often has the attendance list several pages in (page 6 of 20 in a live test). */
export async function pdfPagesAsPng(path: string, maxPages = 8): Promise<string[]> {
  // standardFontDataUrl: a PDF that uses Helvetica or Times without embedding them (most PDFs from office and
  // reporting tools) otherwise renders as a BLANK page, so Glimmer read nothing (found in the live review's packs).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, standardFontDataUrl: STANDARD_FONTS }).promise;
  const out: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(1.6, MAX_PAGE_PX / Math.max(base.width, base.height)) });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as any, viewport: vp }).promise;
    out.push(`data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`);
  }
  await doc.destroy();
  return out;
}

async function imagesOf(path: string): Promise<string[]> {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return pdfPagesAsPng(path);
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return [`data:${mime};base64,${readFileSync(path).toString("base64")}`];
}

/** One document read by Muse Glimmer. Throws if the reply is not valid against the schema after one retry. */
export async function readWithGlimmer(path: string): Promise<{ extraction: Extraction; ms: number }> {
  const t0 = Date.now();
  const images = await imagesOf(path);
  const content = [
    { type: "text", text: `Document file: ${basename(path)}${images.length > 1 ? ` (${images.length} pages, in order)` : ""}` },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: secondReaderModel(),
        temperature: 0,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content }],
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    last = r.ok ? (j.choices?.[0]?.message?.content ?? "") : `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`;
    if (!r.ok) continue;
    try {
      const extraction = ExtractionSchema.parse(JSON.parse(last.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()));
      return { extraction, ms: Date.now() - t0 };
    } catch {
      /* invalid JSON or schema: retry once */
    }
  }
  throw new Error(`Muse Glimmer did not return a valid reading for ${basename(path)}: ${last.slice(0, 160)}`);
}

export type SecondReading = { docId: string; extraction?: Extraction; error?: string; ms?: number };

export type SecondReaderResult = {
  model: string;
  /** Documents Muse Glimmer read (recordings are heard by Voice Transcribe only, so they are not re-read). */
  read: number;
  unread: { docId: string; reason: string }[];
  /** Fact-level agreement on the facts the engine uses (wording of quotes does not count). */
  agreed: number;
  total: number;
  disagreements: { docId: string; what: string }[];
  /** Would the decision change if Glimmer's reading were used instead of Muse Spark's? */
  changesDecision: { what: string }[];
  test: TestResult;
};

/** A fact reduced to what the decision uses, so wording differences in quotes do not count as disagreement. */
function keyOf(f: Fact): string {
  const minute = (iso: string) => iso.slice(0, 16);
  if (f.kind === "flight_leg") return `flight|${f.directorId}|${f.originCode}|${f.destCode}|${minute(f.departUtc)}|${minute(f.arriveUtc)}`;
  if (f.kind === "hotel_stay") return `hotel|${f.directorId}|${f.placeCode}|${minute(f.checkInUtc)}|${minute(f.checkOutUtc)}`;
  return `claim|${f.directorId}|${f.placeCode}|${f.source}`;
}
const describe = (k: string) => k.split("|").join(" ");

/** Compares the two readings, then decides the meeting again from Glimmer's reading with the same engine.
 *  Only a different decision (any director's presence, or the verdict) fails the check; a fact that differs
 *  without changing the answer is reported but does not hold the meeting up. */
export function secondOpinion(
  items: ExtractedItem[],
  readings: SecondReading[],
  company: Company,
  meeting: Meeting,
  jurisdiction: Jurisdiction,
  primary: { facts: Fact[]; evaluation: MeetingEvaluation },
): SecondReaderResult {
  const byDoc = new Map(readings.filter((r) => r.extraction).map((r) => [r.docId, r.extraction!]));
  const unread = readings.filter((r) => !r.extraction).map((r) => ({ docId: r.docId, reason: r.error ?? "not read" }));

  const disagreements: SecondReaderResult["disagreements"] = [];
  let agreed = 0;
  let total = 0;
  for (const [docId, extraction] of byDoc) {
    const a = new Set(primary.facts.filter((f) => f.cite.docId === docId).map(keyOf));
    const b = new Set(toFacts([{ docId, extraction }], company.directors, { refUtc: meeting.startUtc }).facts.map(keyOf)); // same year rule as for Muse Spark
    for (const k of new Set([...a, ...b])) {
      total += 1;
      if (a.has(k) && b.has(k)) agreed += 1;
      else disagreements.push({ docId, what: `${a.has(k) ? "only Muse Spark read" : "only Muse Glimmer read"}: ${describe(k)}` });
    }
  }

  const swapped = items.map((it) => (byDoc.has(it.docId) ? { ...it, extraction: byDoc.get(it.docId)! } : it));
  const other = decide(swapped, company, meeting, jurisdiction).evaluation;
  const name = (id: string) => company.directors.find((d) => d.id === id)?.name ?? id;
  const changesDecision: SecondReaderResult["changesDecision"] = [];
  for (const p of primary.evaluation.presence) {
    const q = other.presence.find((x) => x.directorId === p.directorId);
    if (q && q.status !== p.status) changesDecision.push({ what: `${name(p.directorId)}: ${p.status} from Muse Spark's reading, ${q.status} from Muse Glimmer's` });
  }
  if (other.verdict !== primary.evaluation.verdict) changesDecision.push({ what: `verdict: ${primary.evaluation.verdict} from Muse Spark's reading, ${other.verdict} from Muse Glimmer's` });

  const base = { id: "SECOND-READER", label: "A second, independent model reads the evidence the same way", basis: "evidence" as const, citation: "Evidence check (not a legal test)" };
  const m = secondReaderModel();
  let test: TestResult;
  if (changesDecision.length) {
    test = { ...base, status: "fail", detail: `Read independently by ${m}, the evidence leads to a different answer (${changesDecision.map((c) => c.what).join("; ")}). A person should look at the documents.` };
  } else if (!byDoc.size) {
    // A second reader that was asked and failed (in a live test NVIDIA answered 404 to every document) is not the
    // same as no second reader: the second opinion is missing, so a person should look.
    test = unread.length
      ? { ...base, status: "inconclusive", detail: `The second reader (${m}) could not read any document (${unread[0].reason}), so the second opinion is missing.` }
      : { ...base, status: "not_applicable", detail: `There was no document for the second reader (${m}) to read.` };
  } else {
    const partial = unread.length ? ` ${unread.length} document${unread.length === 1 ? " was" : "s were"} not re-read.` : "";
    const facts = agreed === total ? `${agreed}/${total} facts identical` : `only ${agreed}/${total} facts read the same way; see the differences`;
    test = { ...base, status: "pass", detail: `Read independently by ${m}, the evidence leads to the same answer for every director (${facts}).${partial}` };
  }
  return { model: m, read: byDoc.size, unread, agreed, total, disagreements, changesDecision, test };
}

/** Reads every non-recording document with Muse Glimmer, a few at a time. Never throws: failures are recorded. */
export async function readAllWithGlimmer(docs: { docId: string; path: string }[], onProgress?: (msg: string) => void): Promise<SecondReading[]> {
  let done = 0;
  return pool(docs, 3, async ({ docId, path }) => {
    try {
      const r = await readWithGlimmer(path);
      onProgress?.(`Second reader ${++done}/${docs.length}: ${basename(docId)}`);
      return { docId, extraction: r.extraction, ms: r.ms };
    } catch (e) {
      onProgress?.(`Second reader ${++done}/${docs.length}: ${basename(docId)} (not read)`);
      return { docId, error: (e as Error).message.slice(0, 200) };
    }
  });
}

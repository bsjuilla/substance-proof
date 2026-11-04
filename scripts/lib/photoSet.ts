// Pure helpers for the Muse Image "camera" test set. No network, no key: unit-tested in tests/photoSet.test.ts.
// The test set is built by scripts/photograph-set.ts and scored by scripts/score-photo.ts.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AIRPORTS } from "../../src/engine/gazetteer";

/** Official price (https://dev.meta.ai/docs/pricing-rate-limits, read 2 Nov 2026): "$0.01 per image". */
export const MUSE_IMAGE_USD_PER_IMAGE = 0.01;

/** Every image this pipeline makes is AI-made. The marker goes in the file name and in the manifest. */
export const AI_TAG = "AIPHOTO";

/** Asks for a phone photo of the SAME page. Text must not change: that is audited by a person afterwards. */
export const PHOTO_PROMPT =
  "Turn this into a realistic smartphone photo of this exact printed page lying on a desk: slight perspective tilt, " +
  "a soft fold or crease, uneven indoor lighting and a faint shadow. Keep every printed character, number, name, date, " +
  "time and code exactly as it is and fully legible. Do not add, remove, translate or retype any text. " +
  "Do not add logos, people, hands or faces.";

/** Asks for a boarding pass in a layout nobody in this project wrote. Fields come from the answer key. */
export function newLayoutPrompt(f: { passenger: string; from: string; to: string; date: string; dep: string; arr: string; flight: string; style: string }): string {
  return (
    `A flat scan of a fictional airline boarding pass, ${f.style}. Airline name: "SPECIMEN AIR" (no real airline, no real logo). ` +
    `Print these fields exactly: Passenger: ${f.passenger}. Flight: ${f.flight}. From: ${f.from}. To: ${f.to}. Date: ${f.date}. ` +
    `Departs: ${f.dep} (local time). Arrives: ${f.arr} (local time). Across the top print: "SPECIMEN — SYNTHETIC DOCUMENT". ` +
    "No barcode, no QR code, no photo, no other names, no other dates or times."
  );
}

export const LAYOUT_STYLES = [
  "landscape ticket with a tear-off stub on the right",
  "narrow portrait mobile-wallet card",
  "thermal-paper airport kiosk printout with small monospaced text",
  "A4 home-printed e-boarding pass with a large header band",
  "compact card with the times in large digits and the names in small capitals",
];

/** The evidence documents of one pack: travel and stay files. The minutes are never photographed or replaced. */
export function evidenceFiles(packDir: string): string[] {
  const out: string[] = [];
  for (const sub of ["travel", "stay"]) {
    let names: string[] = [];
    try { names = readdirSync(join(packDir, sub)); } catch { continue; }
    for (const n of names.sort()) if (/\.(pdf|png|jpe?g|webp)$/i.test(n)) out.push(join(packDir, sub, n));
  }
  return out;
}

/** "t03/stay/folio_A_SINGAPORE.pdf" -> "t03/stay/AIPHOTO_folio_A_SINGAPORE.png" */
export function photoRel(rel: string): string {
  const parts = rel.split("/");
  const base = parts.pop()!.replace(/\.[^.]+$/, "");
  return [...parts, `${AI_TAG}_${base}.png`].join("/");
}

export function packRel(packsRoot: string, file: string): string {
  return relative(packsRoot, file).split("\\").join("/");
}

/** Local wall-clock time at an airport, as a boarding pass prints it. Unknown airport -> undefined (never guess). */
export function localTime(iataCode: string, utcIso: string): { date: string; time: string } | undefined {
  const a = AIRPORTS[iataCode];
  if (!a) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: a[1], year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(utcIso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("day")} ${g("month")} ${g("year")}`, time: `${g("hour")}:${g("minute")}` };
}

/** Hard spending cap. charge() throws BEFORE a call that could cross the cap. */
export class CostCap {
  spent = 0;
  constructor(readonly capUsd: number) {}
  canSpend(usd: number): boolean { return this.spent + usd <= this.capUsd + 1e-9; }
  reserve(usd: number): void {
    if (!this.canSpend(usd)) throw new Error(`Cost cap reached: spent $${this.spent.toFixed(4)}, next call ~$${usd.toFixed(4)}, cap $${this.capUsd.toFixed(2)}`);
  }
  add(usd: number): void { this.spent += usd; }
}

/** audit.csv: "file,text_changed,notes" filled in by a person after looking at review.html. */
export function parseAudit(csv: string): Map<string, "yes" | "no" | ""> {
  const m = new Map<string, "yes" | "no" | "">();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [file, changed] = line.split(",");
    const v = (changed ?? "").trim().toLowerCase();
    m.set(file.trim(), v === "yes" ? "yes" : v === "no" ? "no" : "");
  }
  return m;
}

export type ManifestEntry = {
  source: string; // pack-relative path of the original document
  output: string; // pack-relative path of the AI-made image
  mode: "photo" | "newlayout";
  model: string;
  prompt: string;
  aiMade: true;
  ok: boolean;
  error?: string;
  costUsd: number;
};

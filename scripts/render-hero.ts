// Renders the hero imagery for the web app from the SAME templates and data as the hero meeting (m11):
// the minutes page, Bruno Castell's Dubai hotel bill, Chandra Velloso's e-ticket, and the real waveform of the
// recording. Nothing is drawn by hand, so the picture shows exactly the evidence the app reads.
//   npx tsx scripts/render-hero.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { eticketHtml, folioHtml, minutesHtml } from "./generate-synthetic";
import { SCENARIOS } from "./scenarios";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "web", "public", "hero");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
mkdirSync(OUT, { recursive: true });

const s = SCENARIOS.find((x) => x.id === "m11")!;
const style = s.style!;
const name = (id: string) => s.company.directors.find((d) => d.id === id)!.name;
const stay = s.travel.B.find((t) => t.type === "stay") as any;
const flight = s.travel.C.find((t) => t.type === "flight") as any;

const docs: { file: string; html: string; height: number }[] = [
  { file: "minutes.png", html: minutesHtml(s, style), height: 760 },
  { file: "folio-dubai.png", html: folioHtml(name("B"), stay, style), height: 520 },
  { file: "eticket.png", html: eticketHtml(name("C"), flight, style), height: 420 },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await browser.newPage();
await p.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
for (const d of docs) {
  await p.setContent(d.html, { waitUntil: "load" });
  await p.screenshot({ path: join(OUT, d.file) as `${string}.png`, clip: { x: 0, y: 0, width: 794, height: d.height } });
  console.log("wrote", d.file);
}
await browser.close();

// Waveform of the real recording (16-bit PCM mono): peak per bucket, mirrored around the centre line.
const wav = readFileSync(join(ROOT, "synthetic", "generated", "dev", "packs", "m11", "recording.wav"));
const dataAt = wav.indexOf("data") + 8;
const samples = new Int16Array(wav.buffer.slice(wav.byteOffset + dataAt, wav.byteOffset + wav.length - ((wav.length - dataAt) % 2)));
const N = 240;
const per = Math.floor(samples.length / N);
const peaks = Array.from({ length: N }, (_, i) => {
  let m = 0;
  for (let k = i * per; k < (i + 1) * per; k++) m = Math.max(m, Math.abs(samples[k]));
  return m / 32768;
});
const top = Math.max(...peaks) || 1;
const bars = peaks.map((v, i) => {
  const h = Math.max(0.6, (v / top) * 38);
  return `<rect x="${i * 4}" y="${(40 - h).toFixed(1)}" width="2.4" height="${(h * 2).toFixed(1)}" rx="1.2"/>`;
}).join("");
writeFileSync(join(OUT, "waveform.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N * 4} 80" preserveAspectRatio="none" fill="currentColor">${bars}</svg>\n`);
console.log("wrote waveform.svg", { seconds: (samples.length / 16000).toFixed(1) });

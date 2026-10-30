// Screenshots of the running app (npm run app first): node scripts/shoot.mjs <out.png> [home|report|viewer|audio|packs|print|upload] [width] [fullPage 1|0]; SCHEME=dark for dark mode
import puppeteer from "puppeteer-core";
const [out, mode = "report", w = "1440", full = "1"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: +w, height: 900, deviceScaleFactor: 1 });
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: process.env.SCHEME ?? "light" }]);
await p.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready);
if (mode === "upload") {
  await p.evaluate(() => { const d = [...document.querySelectorAll("details")].find((x) => /own meeting pack/.test(x.textContent)); if (d) { d.open = true; d.scrollIntoView(); } });
  await new Promise((r) => setTimeout(r, 400));
} else if (mode === "packs") {
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /See the rules it wrote/.test(b.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1200));
} else if (mode !== "home") {
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Open the case/.test(b.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1200));
}
if (mode === "viewer" || mode === "audio") {
  const src = mode === "audio" ? "recording\.wav" : process.env.CHIP ?? "folio_B";
  const nth = Number(process.env.CHIP_N ?? 0);
  await p.evaluate((src, nth) => [...document.querySelectorAll("button.chip")].filter((b) => new RegExp(src).test(b.textContent))[nth]?.click(), src, nth);
  await new Promise((r) => setTimeout(r, 1500));
}
if (mode === "print") await p.emulateMediaType("print");
await p.screenshot({ path: out, fullPage: full === "1" && mode !== "viewer" && mode !== "audio" });
await b.close();

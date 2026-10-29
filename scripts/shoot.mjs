// Screenshots of the running app (npm run app first): node scripts/shoot.mjs <out.png> [home|report|viewer] [width] [fullPage 1|0]
import puppeteer from "puppeteer-core";
const [out, mode = "report", w = "1440", full = "1"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: +w, height: 900, deviceScaleFactor: 1 });
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: process.env.SCHEME ?? "light" }]);
await p.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready);
if (mode !== "home") {
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Open the case/.test(b.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1200));
}
if (mode === "viewer") {
  await p.evaluate(() => [...document.querySelectorAll("button.chip")].find((b) => /folio_B/.test(b.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1500));
}
await p.screenshot({ path: out, fullPage: full === "1" && mode !== "viewer" });
await b.close();

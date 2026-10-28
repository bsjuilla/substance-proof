// Saves README screenshots of the running app (npm run app must be running on 127.0.0.1:8787).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = join(import.meta.dirname, "..", "docs");
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 1500, deviceScaleFactor: 1.5 });
await p.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle0" });
await p.screenshot({ path: join(OUT, "screenshot-home.png") });
await p.click('button[aria-label^="Open recorded run"]');
await p.waitForSelector(".verdict");
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: join(OUT, "screenshot-report.png") });
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: join(OUT, "screenshot-report-dark.png") });
await browser.close();
console.log("saved screenshots to", OUT);

// WCAG 2.2 text-contrast audit of the RUNNING app (npm run app first), in light and dark, on every main view.
// Colours are read from the rendered page (canvas converts oklch etc. to sRGB), so this checks what users see.
//   node scripts/contrast-audit.mjs
import puppeteer from "puppeteer-core";

const VIEWS = ["home", "report", "packs"];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
let failures = 0;

for (const scheme of ["light", "dark"]) {
  for (const view of VIEWS) {
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
    await p.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle0" });
    await p.evaluate(() => document.fonts.ready);
    if (view === "report") await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Open the case/.test(x.textContent))?.click());
    if (view === "packs") await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /See the rules it wrote/.test(x.textContent))?.click());
    await new Promise((r) => setTimeout(r, 1200));
    const bad = await p.evaluate(() => {
      const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const lum = ([r, g, bb]) => [r, g, bb].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      function bgOf(el) {
        const stack = [];
        for (let e = el; e; e = e.parentElement) {
          const c = rgba(getComputedStyle(e).backgroundColor);
          if (c[3] > 0) { stack.push(c); if (c[3] === 1) break; }
        }
        let base = [255, 255, 255];
        for (const c of stack.reverse()) base = over(c, base);
        return base;
      }
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(".desk, svg, dialog:not([open]), .sr-only, [aria-hidden='true']")) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || el.getClientRects().length === 0) continue;
        const bg = bgOf(el);
        const fg = over(rgba(cs.color), bg);
        const L1 = lum(fg), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10);
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const disabled = el.closest("button[disabled]");
        if (ratio < need && !disabled) out.push(`${ratio.toFixed(2)} < ${need}  "${el.textContent.trim().slice(0, 50)}"  <${el.tagName.toLowerCase()} class="${el.className}">`);
      }
      return [...new Set(out)];
    });
    failures += bad.length;
    console.log(`${scheme.padEnd(5)} ${view.padEnd(7)} ${bad.length ? bad.length + " below minimum" : "all text passes"}`);
    for (const x of bad.slice(0, 12)) console.log("   " + x);
  }
}
await b.close();
console.log(failures ? `\n${failures} contrast failure(s).` : "\nAll text meets WCAG 2.2 AA contrast.");
process.exit(failures ? 1 : 0);

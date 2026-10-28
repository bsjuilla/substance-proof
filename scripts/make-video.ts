// Builds the ~3-minute demo video automatically from the running app (npm run app, live key needed for scene 4).
// Output: ~/Downloads/SubstanceProof-VIDEO/substance-proof-demo.mp4 (with synthetic narration)
//         + substance-proof-demo-NO-VOICE.mp4 (captions only, for recording your own voice) + narration.txt
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import puppeteer, { type Page } from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://127.0.0.1:8787/";
const OUT = join(homedir(), "Downloads", "SubstanceProof-VIDEO");
const WORK = join(OUT, "work");
const FF = ffmpegPath as unknown as string;
const W = 1920, H = 1080;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ff = (args: string[]) => execFileSync(FF, ["-y", "-loglevel", "error", ...args], { stdio: "pipe" });

function wavSeconds(path: string): number {
  const b = readFileSync(path);
  const byteRate = b.readUInt32LE(28);
  let off = 12;
  while (off < b.length - 8) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "data") return size / byteRate;
    off += 8 + size;
  }
  throw new Error("no data chunk in " + path);
}

function narrate(id: string, text: string): { wav: string; secs: number } {
  const json = join(WORK, `${id}.json`);
  const wav = join(WORK, `${id}.wav`);
  writeFileSync(json, JSON.stringify([{ voice: 0, pitch: "+0%", rate: "-3%", text }]));
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(import.meta.dirname, "tts.ps1"), "-Json", json, "-Out", wav], { stdio: "pipe" });
  return { wav, secs: wavSeconds(wav) };
}

const SLIDE_CSS = `body{margin:0;width:${W}px;height:${H}px;background:#f7f8fb;color:#1b2235;font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 140px;box-sizing:border-box}
h1{font-family:'Palatino Linotype',Georgia,serif;font-size:84px;margin:0 0 28px;letter-spacing:-1px;line-height:1.1}
p{font-size:38px;line-height:1.45;margin:0 0 18px;max-width:1500px;color:#3a4257}
.brand{position:absolute;top:56px;left:140px;font-family:'Palatino Linotype',Georgia,serif;font-size:34px;font-weight:700;display:flex;gap:14px;align-items:center}
.mark{background:#243a6b;color:#fff;font:700 20px 'Segoe UI';padding:8px 10px;border-radius:5px}
.note{position:absolute;bottom:48px;left:140px;font-size:22px;color:#6a7286}
.box{border:3px solid #d9dde7;background:#fff;border-radius:6px;padding:26px 32px;font-size:34px;line-height:1.4}
.fail{color:#b4232a;border-color:#b4232a;background:#fdecec;font-family:'Palatino Linotype',Georgia,serif;font-weight:700;font-size:64px;display:inline-block;padding:14px 34px}
table{border-collapse:collapse;font-size:34px;margin-top:14px} td,th{padding:14px 26px;border-bottom:2px solid #d9dde7;text-align:left} th{color:#6a7286;font-size:24px;text-transform:uppercase;letter-spacing:1px}
.big{font-weight:700;color:#14684d}`;
const slide = (inner: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${SLIDE_CSS}</style></head><body><div class="brand"><span class="mark">SP</span>Substance Proof</div>${inner}<div class="note">Synthetic demo data: every person, company and document is fictional. Information and calculation only, not legal or tax advice.</div></body></html>`;

type Scene = {
  id: string;
  caption: string;
  narration: string;
  kind: "slide" | "app";
  html?: string;
  act?: (p: Page, secs: number) => Promise<void>; // runs while recording
  fitToNarration?: boolean; // speed the recording up/down to the narration length (live run)
};

async function caption(p: Page, text: string) {
  await p.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:1500px;background:rgba(20,26,42,.88);color:#fff;font:600 30px 'Segoe UI',sans-serif;padding:14px 28px;border-radius:8px;z-index:99999;text-align:center;line-height:1.35";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function scrollToSel(p: Page, sel: string, offset = 90) {
  await p.evaluate((s, o) => {
    const el = document.querySelector(s);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: "smooth" });
  }, sel, offset);
  await sleep(900);
}

async function clickText(p: Page, selector: string, text: string) {
  await p.evaluate((s, t) => {
    const el = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.textContent?.includes(t));
    el?.click();
  }, selector, text);
}

const SCENES: Scene[] = [
  {
    id: "s1-hook", kind: "slide",
    caption: "",
    narration: "These minutes say all three directors met in Jersey. The hotel bill and the meeting recording say one of them was in Dubai. An e-ticket says another was still on a plane. Substance Proof catches this, and shows you exactly where it found it.",
    html: slide(`<h1>The minutes say the board met in Jersey.<br>Did it?</h1>
      <div style="display:flex;gap:40px;align-items:stretch;margin-top:20px">
        <div class="box" style="flex:1"><b>Minutes</b><br>Bruno Castell: “present in St Helier”</div>
        <div class="box" style="flex:1"><b>Hotel bill · Recording</b><br>Dubai · “dialling in from my hotel in Dubai”</div>
      </div><div style="margin-top:36px"><span class="box fail">✕ FAIL: quorum not evidenced</span></div>`),
  },
  {
    id: "s2-problem", kind: "slide",
    caption: "",
    narration: "Jersey's Economic Substance Law requires a quorum of directors to be physically present in Jersey when the board meets, with penalties of up to one hundred thousand pounds. Singapore has a similar test. Today a company secretary checks this by hand, and the minutes only record what people claimed. I'm an accounting student interning at a trust company, so this is work I see first hand.",
    html: slide(`<h1>A real rule, checked by hand</h1>
      <p><b>Jersey</b> Economic Substance Law 2019, Art. 5(3)(b): “a quorum of directors physically present in Jersey”. Penalty up to £10,000, then up to £100,000 (Art. 9).</p>
      <p><b>Singapore</b> (IRAS): virtual meetings count as decided in Singapore if at least 50% of strategic directors, or the chairman, are physically there.</p>
      <p>Minutes record what was <i>claimed</i>. Nothing checks the claim against the evidence.</p>`),
  },
  {
    id: "s3-home", kind: "app",
    caption: "Reads the whole meeting pack: minutes, travel documents, hotel bills, recording",
    narration: "Substance Proof reads a whole meeting pack: the minutes, boarding passes, e-tickets, hotel bills, and the meeting recording.",
    act: async (p, secs) => {
      await p.goto(APP, { waitUntil: "networkidle0" });
      await caption(p, "Reads the whole meeting pack: minutes, travel documents, hotel bills, recording");
      await sleep(secs * 1000 * 0.5);
      await scrollToSel(p, "#live-h", 120);
      await sleep(secs * 1000 * 0.4);
    },
  },
  {
    id: "s4-live", kind: "app", fitToNarration: true,
    caption: "LIVE call to Muse Spark + Muse Voice Transcribe (sped up)",
    narration: "Here is a live run. Muse Spark reads every document, even phone photos and scans. Muse Voice Transcribe turns the recording into a roll call. Every fact comes back with the exact words it was read from.",
    act: async (p) => {
      await caption(p, "LIVE call to Muse Spark + Muse Voice Transcribe (sped up)");
      await p.evaluate(() => {
        const row = [...document.querySelectorAll<HTMLElement>(".sample")].find((e) => e.textContent?.includes("m11 ·"));
        row?.scrollIntoView({ block: "center" });
        row?.querySelector<HTMLButtonElement>("button")?.click();
      });
      await p.waitForSelector(".verdict", { timeout: 240_000 });
      await sleep(600);
      await caption(p, "Live result: FAIL, quorum not evidenced in Jersey");
      await sleep(2500);
    },
  },
  {
    id: "s5-timeline", kind: "app",
    caption: "Where each director really was, from independent evidence",
    narration: "This is where each director really was. Alice: a hotel in Saint Helier covers the whole meeting. Bruno: the minutes say Saint Helier, but his hotel bill is in Dubai, and on the recording he says he is dialling in from his hotel in Dubai. Chandra: her e-ticket shows her landing in Jersey forty minutes after the meeting began.",
    act: async (p, secs) => {
      await caption(p, "Where each director really was, from independent evidence");
      await scrollToSel(p, "#tl-h", 40);
      await sleep(secs * 1000 * 0.35);
      await caption(p, "Bruno: minutes say St Helier; hotel bill and recording say Dubai");
      await clickText(p, "button.chip", "recording.wav");
      await sleep(secs * 1000 * 0.3);
      await p.evaluate(() => document.querySelector<HTMLDialogElement>("dialog.viewer")?.close());
      await sleep(400);
      await caption(p, "Chandra: e-ticket lands in Jersey 40 minutes after the meeting began");
      await sleep(secs * 1000 * 0.3);
    },
  },
  {
    id: "s6-rules", kind: "app",
    caption: "Tested code applies the law; the AI never decides a test",
    narration: "The verdict is not decided by the AI. Tested code applies the published law. Article five of the Jersey law needs a quorum of two physically present. The evidence shows only one, so the test fails. Stricter points that come from guidance are labelled, and can be switched off.",
    act: async (p, secs) => {
      await caption(p, "Tested code applies the law; the AI never decides a test");
      await scrollToSel(p, "#rules-h", 110);
      await sleep(secs * 1000 * 0.9);
    },
  },
  {
    id: "s7-agent", kind: "app",
    caption: "Agent (Muse Spark tool calls) drafts; a person approves; nothing is sent",
    narration: "Then an agent built on Muse Spark's tool calling drafts corrections for the company secretary, quoting both sides. Every tool call is checked by code, and nothing is sent until a person approves it.",
    act: async (p, secs) => {
      await caption(p, "Agent (Muse Spark tool calls) drafts; a person approves; nothing is sent");
      await scrollToSel(p, "#agent-h", 110);
      await sleep(secs * 1000 * 0.35);
      await clickText(p, "button", "Approve");
      await sleep(secs * 1000 * 0.2);
      await p.evaluate(() => document.querySelector<HTMLDetailsElement>("details")?.setAttribute("open", ""));
      await p.evaluate(() => document.querySelector("details")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      await sleep(secs * 1000 * 0.35);
    },
  },
  {
    id: "s8-results", kind: "slide",
    caption: "",
    narration: "On thirty held-out meetings with phone photos, scans and different layouts, it read all one hundred and sixty six facts correctly, and every verdict was right. A second AI model, Grok, checked the same documents independently and agreed on all eighty six directors. On a deliberately hostile stress set, accuracy drops to eighty six percent, but it made zero dangerous errors. When it can't read something, it asks for review instead of guessing.",
    html: slide(`<h1>Measured, not claimed</h1>
      <table><tr><th>Test set</th><th>Facts read exactly</th><th>Verdicts</th><th>Dangerous errors</th></tr>
      <tr><td>30 held-out meetings (photos, scans, e-tickets)</td><td class="big">166 / 166</td><td class="big">30 / 30</td><td class="big">0</td></tr>
      <tr><td>Stress set (blurry, handwritten, French)</td><td>55 / 64 (86%)</td><td>9 / 12</td><td class="big">0</td></tr>
      <tr><td>Independent cross-check by Grok</td><td colspan="2">86 / 86 directors agree</td><td></td></tr></table>
      <p style="margin-top:30px;font-size:30px">Dangerous error = saying PASS or “present” when it isn't true. Misses fall back to REVIEW.</p>`),
  },
  {
    id: "s9-close", kind: "slide",
    caption: "",
    narration: "Substance Proof. The minutes say the board met in Jersey. Now you can prove it. Built with Muse Spark and Muse Voice Transcribe.",
    html: slide(`<h1>Substance Proof</h1><p>The minutes say the board met in Jersey. Now you can prove it.</p>
      <p style="font-size:30px;color:#6a7286">Built with Muse Spark · Muse Voice Transcribe · github.com/bsjuilla/substance-proof</p>`),
  },
];

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", `--window-size=${W},${H}`] });
  const p = await browser.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

  const segVoice: string[] = [];
  const segSilent: string[] = [];
  const timeline: string[] = [];
  let t = 0;
  for (const s of SCENES) {
    const { wav, secs } = narrate(s.id, s.narration);
    const dur = secs + 0.6;
    const outV = join(WORK, `${s.id}.mp4`);
    const outS = join(WORK, `${s.id}-silent.mp4`);
    if (s.kind === "slide") {
      const png = join(WORK, `${s.id}.png`);
      await p.setContent(s.html!, { waitUntil: "load" });
      await p.screenshot({ path: png as `${string}.png` });
      ff(["-loop", "1", "-t", dur.toFixed(2), "-i", png, "-i", wav, "-filter_complex", `[0:v]scale=${W}:${H},fps=30,format=yuv420p[v];[1:a]apad[a]`, "-map", "[v]", "-map", "[a]", "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", outV]);
    } else {
      const raw = join(WORK, `${s.id}-raw.mp4`);
      const rec = await p.screencast({ path: raw as `${string}.mp4`, ffmpegPath: FF, fps: 30 });
      const t0 = Date.now();
      await s.act!(p, dur);
      if (!s.fitToNarration) {
        const left = dur * 1000 - (Date.now() - t0);
        if (left > 0) await sleep(left);
      }
      await rec.stop();
      const rawSecs = (Date.now() - t0) / 1000;
      const factor = s.fitToNarration ? dur / rawSecs : 1; // < 1 speeds up
      ff(["-i", raw, "-i", wav, "-filter_complex", `[0:v]setpts=${factor.toFixed(4)}*PTS,scale=${W}:${H},fps=30,format=yuv420p[v];[1:a]apad[a]`, "-map", "[v]", "-map", "[a]", "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", outV]);
      if (s.fitToNarration) console.log(`  live scene: ${rawSecs.toFixed(0)}s real time shown in ${dur.toFixed(1)}s (x${(1 / factor).toFixed(1)})`);
    }
    // Silent copy (captions/slides only) for recording your own voice over it.
    ff(["-i", outV, "-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", outS]);
    segVoice.push(outV);
    segSilent.push(outS);
    const mm = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
    timeline.push(`[${mm(t)}–${mm(t + dur)}] ${s.id}\n${s.narration}\n`);
    t += dur;
    console.log(`${s.id}: ${dur.toFixed(1)}s`);
  }
  await browser.close();

  const concat = (list: string[], out: string) => {
    const txt = join(WORK, `concat-${Date.now()}.txt`);
    writeFileSync(txt, list.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    ff(["-f", "concat", "-safe", "0", "-i", txt, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
  };
  concat(segVoice, join(OUT, "substance-proof-demo.mp4"));
  concat(segSilent, join(OUT, "substance-proof-demo-NO-VOICE.mp4"));
  writeFileSync(join(OUT, "narration.txt"), `Read this over substance-proof-demo-NO-VOICE.mp4 to replace the synthetic voice with your own.\nTotal length: ${t.toFixed(0)} seconds.\n\n` + timeline.join("\n"));
  console.log(`\nDone: ${t.toFixed(0)}s total. Files in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

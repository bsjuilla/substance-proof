// Generates fictional board-meeting packs: minutes, boarding passes / e-tickets, hotel folios, plus the
// hidden answers. Everything is stamped SPECIMEN. Two sets:
//   npm run gen -- dev    (10 hand-written traps, used while building)
//   npm run gen -- test   (30 randomised, varied-layout meetings, held out for the final score)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { evaluateMeeting } from "../src/engine/evaluate";
import type { Fact } from "../src/engine/types";
import { SCENARIOS, type DocStyle, type Scenario, type TravelItem } from "./scenarios";
import { buildTestScenarios } from "./testset";
import { oracle } from "./oracle";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SET = (process.argv[2] ?? "dev") as "dev" | "test" | "stress";
const ROOT = join(import.meta.dirname, "..", "synthetic", "generated", SET);
const PACKS = join(ROOT, "packs");
const ANSWERS = join(ROOT, "answers");
const LABELLER = join(ROOT, "labeller");

const PLACES: Record<string, { tz: string; city: string; airport?: string }> = {
  JER: { tz: "Europe/Jersey", city: "Jersey", airport: "Jersey Airport" },
  "CITY:STHELIER": { tz: "Europe/Jersey", city: "St Helier, Jersey" },
  LHR: { tz: "Europe/London", city: "London", airport: "London Heathrow" },
  "CITY:LONDON": { tz: "Europe/London", city: "London, United Kingdom" },
  DXB: { tz: "Asia/Dubai", city: "Dubai", airport: "Dubai International" },
  "CITY:DUBAI": { tz: "Asia/Dubai", city: "Dubai, UAE" },
  SIN: { tz: "Asia/Singapore", city: "Singapore", airport: "Singapore Changi" },
  "CITY:SINGAPORE": { tz: "Asia/Singapore", city: "Singapore" },
  HKG: { tz: "Asia/Hong_Kong", city: "Hong Kong", airport: "Hong Kong International" },
  "CITY:HONGKONG": { tz: "Asia/Hong_Kong", city: "Hong Kong" },
  CDG: { tz: "Europe/Paris", city: "Paris", airport: "Paris Charles de Gaulle" },
  "CITY:PARIS": { tz: "Europe/Paris", city: "Paris, France" },
};
const DEFAULT_STYLE: DocStyle = { boardingPass: "card", folio: "table", minutes: "table", passengerName: "normal" };

function local(utcIso: string, tz: string) {
  const d = new Date(utcIso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).formatToParts(d);
  const p = f({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short", weekday: "long" });
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const off = f({ timeZoneName: "longOffset" }).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  const mm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "2-digit" }).format(d);
  const monthLong = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long" }).format(d);
  return {
    date: `${g("day")} ${g("month")} ${g("year")}`,
    dateSlash: `${g("day")}/${mm}/${g("year")}`,
    dateLong: `${g("weekday")} ${Number(g("day"))} ${monthLong} ${g("year")}`,
    time: `${g("hour")}:${g("minute")}`,
    timeDot: `${Number(g("hour")) % 12 || 12}.${g("minute")} ${Number(g("hour")) < 12 ? "a.m." : "p.m."}`,
    time12: `${Number(g("hour")) % 12 || 12}:${g("minute")} ${Number(g("hour")) < 12 ? "AM" : "PM"}`,
    timeFr: `${g("hour")}h${g("minute")}`,
    zone: g("timeZoneName"),
    utcOffset: off === "GMT" ? "UTC+00:00" : off.replace("GMT", "UTC"),
  };
}

const passenger = (name: string, style: DocStyle) => {
  if (style.passengerName === "normal") return name.toUpperCase();
  const parts = name.split(" ");
  const surname = parts.pop()!;
  return `${surname}/${parts.join(" ")}`.toUpperCase();
};

const STAMP = `<div style="position:absolute;top:12px;right:16px;color:#b00020;border:2px solid #b00020;padding:2px 8px;font:700 11px Arial;letter-spacing:1px;opacity:.75">SPECIMEN — SYNTHETIC DOCUMENT</div>`;
const page = (body: string, extraCss = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
 body{font-family:Georgia,serif;margin:0;padding:44px 52px;color:#111;position:relative}
 h1{font-size:17px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}
 h2{font-size:13px;margin:20px 0 6px;text-transform:uppercase}
 table{border-collapse:collapse;width:100%;font-size:13px} td,th{border:1px solid #999;padding:6px 8px;text-align:left}
 p{font-size:13px;line-height:1.5;margin:6px 0} ${extraCss}
</style></head><body>${STAMP}${body}</body></html>`;

function meetingZone(s: Scenario): string {
  if (s.meeting.venueCode) return PLACES[s.meeting.venueCode]?.tz ?? "UTC";
  return s.jurisdiction === "SG" ? "Asia/Singapore" : "Europe/Jersey";
}

export function minutesHtml(s: Scenario, style: DocStyle): string {
  const tz = meetingZone(s);
  const st = local(s.meeting.startUtc, tz);
  const en = local(s.meeting.endUtc, tz);
  const virtual = s.meeting.mode === "virtual";
  const place = virtual ? "By video conference (no physical venue)" : s.meeting.venueCode ? (PLACES[s.meeting.venueCode]?.city ?? "—") : "—";
  const dirOf = (id: string) => s.company.directors.find((x) => x.id === id)!;
  const business = s.meeting.isStrategic
    ? `<p>The Board considered and <b>RESOLVED</b> to approve the Company's 2026–2028 investment strategy, to acquire a 40% interest in Vantrell Logistics Ltd for USD 18,500,000, and to appoint the Company's bankers.</p>`
    : `<p>The Board received and noted the management accounts for the quarter and confirmed the next meeting date. No other business was transacted.</p>`;
  const records = `<p>The minutes of this and all board meetings and the records of the Company are kept at the registered office of the Company${s.jurisdiction === "SG" ? " in Singapore" : " in St Helier, Jersey"}.</p>`;

  if (style.minutes === "prose") {
    const present = s.meeting.attendeeIds
      .map((id) => `${dirOf(id).name}${dirOf(id).isChair ? " (Chair)" : ""}, ${s.minutesClaims[id]?.text ?? "present"}`)
      .join("; ");
    // Prose minutes say "local time" when there is a venue; a virtual meeting must name its zone.
    const when = virtual
      ? `${st.dateLong}, commencing at ${st.timeDot} and closing at ${en.timeDot} (${tz === "Asia/Singapore" ? "Singapore time, " + st.zone : st.zone})`
      : `${st.dateLong}, commencing at ${st.timeDot} and closing at ${en.timeDot} (local time)`;
    return page(`
     <h1>${s.company.name}</h1>
     <p><i>Minutes of a meeting of the directors held on ${when}${virtual ? ", by video conference" : `, at the registered office, ${place}`}.</i></p>
     <p><b>PRESENT:</b> ${present}.</p>
     <p><b>1. QUORUM.</b> The Chair noted that a quorum of ${s.company.quorumRequired} was present and declared the meeting duly constituted.</p>
     <p><b>2. BUSINESS.</b></p>${business}
     <p><b>3. RECORDS.</b></p>${records}
     <p><b>4. CLOSE.</b> There being no further business the meeting was closed.</p>
     <p style="margin-top:40px">……………………………… Chair</p>`);
  }

  if (style.minutes === "handwritten") {
    // A pre-printed register filled in by hand (script font, uneven, local time only).
    const hand = `font-family:'Ink Free','Segoe Print','Segoe Script',cursive;font-size:17px;color:#1b2a6b`;
    const hrows = s.meeting.attendeeIds
      .map((id, k) => `<tr><td style="${hand};transform:rotate(${(k % 2 ? -0.6 : 0.5)}deg)">${dirOf(id).name}</td><td style="${hand}">${s.minutesClaims[id]?.text ?? ""}</td><td></td></tr>`)
      .join("");
    return page(`
     <h1>${s.company.name}</h1>
     <p><b>Board meeting: attendance register and minutes</b></p>
     <p>Date: <span style="${hand}">${st.dateSlash}</span> &nbsp; From: <span style="${hand}">${st.timeDot}</span> &nbsp; To: <span style="${hand}">${en.timeDot}</span> &nbsp; (local time) &nbsp; Venue: <span style="${hand}">${virtual ? "video call (" + st.zone + ")" : place}</span></p>
     <table><tr><th>Director</th><th>Attending (where from)</th><th>Signature</th></tr>${hrows}</table>
     <h2>Business</h2>${business}${records}`);
  }

  const rows = s.meeting.attendeeIds
    .map((id) => `<tr><td>${dirOf(id).name}</td><td>${dirOf(id).isChair ? "Director and Chairman" : "Director"}</td><td>${s.minutesClaims[id]?.text ?? "—"}</td></tr>`)
    .join("");
  return page(`
   <h1>${s.company.name}</h1>
   <p><b>Minutes of a meeting of the Board of Directors</b></p>
   <p>Date: ${st.date} &nbsp; Time: ${st.time}–${en.time} (${st.zone}) &nbsp; Place: ${place}</p>
   <h2>Attendance</h2>
   <table><tr><th>Name</th><th>Capacity</th><th>Attended</th></tr>${rows}</table>
   <p>A quorum of ${s.company.quorumRequired} directors being present, the Chairman declared the meeting open.</p>
   <h2>Business</h2>${business}${records}
   <p style="margin-top:40px">Signed: ______________________ Chairman</p>`);
}

export function cardHtml(name: string, f: Extract<TravelItem, { type: "flight" }>, style: DocStyle): string {
  const o = PLACES[f.origin], d = PLACES[f.dest];
  const dep = local(f.departUtc, o.tz), arr = local(f.arriveUtc, d.tz);
  if (style.clock === "12h") { dep.time = dep.time12; arr.time = arr.time12; }
  return `<div id="card" style="position:relative;width:680px;height:300px;background:#fff;border-radius:14px;box-shadow:0 2px 8px #0003;overflow:hidden;font-family:Arial,sans-serif">
   <div style="background:#0b3d91;color:#fff;padding:12px 20px;font-weight:700;font-size:18px;display:flex;justify-content:space-between"><span>SAMPLE AIR ✈</span><span>BOARDING PASS</span></div>
   <div style="position:absolute;top:50px;right:14px;color:#b00020;border:2px solid #b00020;padding:2px 6px;font:700 10px Arial;opacity:.8">SPECIMEN — SYNTHETIC</div>
   <div style="padding:18px 20px;display:flex;gap:30px;align-items:center">
    <div><div style="font-size:11px;color:#666">FROM</div><div style="font-size:42px;font-weight:700">${f.origin}</div><div style="font-size:12px">${o.airport ?? o.city}</div></div>
    <div style="font-size:30px">→</div>
    <div><div style="font-size:11px;color:#666">TO</div><div style="font-size:42px;font-weight:700">${f.dest}</div><div style="font-size:12px">${d.airport ?? d.city}</div></div>
   </div>
   <div style="padding:0 20px;display:flex;gap:30px;font-size:13px">
    <div><div style="color:#666;font-size:11px">PASSENGER</div><b>${passenger(name, style)}</b></div>
    <div><div style="color:#666;font-size:11px">FLIGHT</div><b>${f.flightNo}</b></div>
    <div><div style="color:#666;font-size:11px">DATE</div><b>${dep.date}</b></div>
    <div><div style="color:#666;font-size:11px">DEPARTS (local ${dep.zone})</div><b>${dep.time}</b></div>
    <div><div style="color:#666;font-size:11px">ARRIVES (local ${arr.zone})</div><b>${arr.time}${arr.date !== dep.date ? " (" + arr.date + ")" : ""}</b></div>
   </div></div>`;
}

export function eticketHtml(name: string, f: Extract<TravelItem, { type: "flight" }>, style: DocStyle): string {
  const o = PLACES[f.origin], d = PLACES[f.dest];
  const dep = local(f.departUtc, o.tz), arr = local(f.arriveUtc, d.tz);
  return page(`
   <h1>Sample Air — Electronic ticket receipt</h1>
   <p>Passenger: <b>${passenger(name, style)}</b> &nbsp; Booking reference: SPX${f.flightNo.replace(/\D/g, "")}Q</p>
   <h2>Itinerary</h2>
   <table><tr><th>Flight</th><th>From</th><th>Departure (local)</th><th>To</th><th>Arrival (local)</th></tr>
    <tr><td>${f.flightNo}</td><td>${o.airport} (${f.origin})</td><td>${dep.dateSlash} ${dep.time} (${dep.utcOffset})</td><td>${d.airport} (${f.dest})</td><td>${arr.dateSlash} ${arr.time} (${arr.utcOffset})</td></tr></table>
   <p>Fare basis YSPEC. Baggage 2PC. This receipt is not a boarding pass.</p>`);
}

export function folioHtml(name: string, st: Extract<TravelItem, { type: "stay" }>, style: DocStyle): string {
  const tz = PLACES[st.placeCode].tz;
  const a = local(st.fromUtc, tz), b = local(st.toUtc, tz);
  if (style.folio === "french") {
    return page(`
     <h1>Hôtel Spécimen — ${FR_CITY[st.placeCode] ?? st.city}</h1>
     <p><b>Facture / note de séjour</b></p>
     <table>
      <tr><td>Client</td><td>${name}</td></tr>
      <tr><td>Arrivée</td><td>${a.dateSlash} à ${a.timeFr}</td></tr>
      <tr><td>Départ</td><td>${b.dateSlash} à ${b.timeFr}</td></tr>
     </table>
     <p>Toutes les heures sont indiquées en heure locale. Montant réglé : 1 470,00.</p>`);
  }
  if (style.folio === "letter") {
    return page(`
     <h1>The Specimen Residences — ${st.city}</h1>
     <p>Dear ${name},</p>
     <p>Thank you for choosing The Specimen Residences. This letter confirms your stay with us. You checked in on ${a.dateLong} at ${a.time} and checked out on ${b.dateLong} at ${b.time}. All times on this statement are shown in local time (${tz}).</p>
     <p>Your account has been settled in full (total 1,470.00). We hope to welcome you again.</p>
     <p>Front Office Manager</p>`);
  }
  return page(`
   <h1>The Grand Specimen Hotel — ${st.city}</h1>
   <p><b>Guest folio</b></p>
   <table>
    <tr><td>Guest</td><td>${name}</td></tr>
    <tr><td>Arrival</td><td>${a.date} ${a.time} (${a.zone})</td></tr>
    <tr><td>Departure</td><td>${b.date} ${b.time} (${b.zone})</td></tr>
    <tr><td>Room</td><td>${400 + (name.length % 40)} Deluxe King</td></tr>
   </table>
   <h2>Charges</h2>
   <table><tr><th>Item</th><th>Amount</th></tr><tr><td>Room nights</td><td>1,240.00</td></tr><tr><td>Breakfast</td><td>96.00</td></tr><tr><td>Taxes</td><td>134.00</td></tr><tr><td><b>Total</b></td><td><b>1,470.00</b></td></tr></table>
   <p>Thank you for staying with us. Folio settled by card on departure.</p>`);
}

/** Screenshot HTML, then re-shoot it as a slightly rotated, blurred "phone photo" (JPEG). */
async function photoOf(p: Page, innerHtml: string, out: string, seed: number, harsh = false) {
  await p.setViewport({ width: 720, height: 340, deviceScaleFactor: harsh ? 1 : 2 });
  await p.setContent(`<!doctype html><html><body style="margin:12px;background:#fff">${innerHtml}</body></html>`, { waitUntil: "load" });
  const el = await p.$("#card");
  const png = Buffer.from(await el!.screenshot({ type: "png" })).toString("base64");
  const angle = ((seed % 7) - 3) * (harsh ? 2.4 : 0.9);
  const size = harsh ? { w: 640, h: 400, img: 470 } : { w: 900, h: 560, img: 700 };
  const filter = harsh ? "blur(1.3px) brightness(0.78) contrast(0.85) sepia(0.25)" : "blur(0.6px) brightness(0.93) contrast(1.05)";
  await p.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:radial-gradient(#8a6a4a,#4e3a28);height:${size.h}px;display:flex;align-items:center;justify-content:center">
    <img src="data:image/png;base64,${png}" style="width:${size.img}px;transform:rotate(${angle}deg) perspective(900px) rotateX(${harsh ? 14 : 6}deg);filter:${filter};box-shadow:0 10px 30px #000a"></body></html>`, { waitUntil: "load" });
  await p.screenshot({ path: out as `${string}.jpeg`, type: "jpeg", quality: harsh ? 28 : 60 });
}

const FR_CITY: Record<string, string> = {
  "CITY:STHELIER": "Saint-Hélier, Jersey", "CITY:DUBAI": "Dubaï, Émirats arabes unis", "CITY:SINGAPORE": "Singapour",
  "CITY:LONDON": "Londres, Royaume-Uni", "CITY:HONGKONG": "Hong Kong", "CITY:PARIS": "Paris, France",
};

/** Render HTML to an IMAGE-ONLY PDF (no text layer), like a scanned page. */
async function scannedPdf(p: Page, html: string, out: string) {
  await p.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.4 });
  await p.setContent(html, { waitUntil: "load" });
  const shot = Buffer.from(await p.screenshot({ type: "jpeg", quality: 55, fullPage: false })).toString("base64");
  await p.setContent(`<!doctype html><html><body style="margin:0"><img src="data:image/jpeg;base64,${shot}" style="width:100%;transform:rotate(0.6deg);filter:grayscale(1) contrast(1.15) blur(0.3px)"></body></html>`, { waitUntil: "load" });
  await p.pdf({ path: out, format: "A4", printBackground: true, pageRanges: "1", margin: { top: "0", bottom: "0", left: "0", right: "0" } });
}

function factsFor(s: Scenario, docPaths: Record<string, string>): Fact[] {
  const facts: Fact[] = [];
  for (const [id, items] of Object.entries(s.travel)) {
    for (const it of items) {
      if (it.type === "flight") {
        facts.push({ kind: "flight_leg", directorId: id, originCode: it.origin, destCode: it.dest, departUtc: it.departUtc, arriveUtc: it.arriveUtc, cite: { docId: docPaths[`${id}:${it.origin}-${it.dest}`], page: 1 } });
      } else {
        facts.push({ kind: "hotel_stay", directorId: id, placeCode: it.placeCode, checkInUtc: it.fromUtc, checkOutUtc: it.toUtc, cite: { docId: docPaths[`${id}:${it.placeCode}`], page: 1 } });
      }
    }
  }
  for (const [id, c] of Object.entries(s.minutesClaims)) {
    if (c.placeCode) facts.push({ kind: "claimed_location", directorId: id, placeCode: c.placeCode, source: "minutes", cite: { docId: `${s.id}/minutes.pdf`, page: 1, quote: c.text } });
  }
  for (const line of s.recording ?? []) {
    if (line.claim) facts.push({ kind: "claimed_location", directorId: line.speaker, placeCode: line.claim, source: "recording", cite: { docId: `${s.id}/recording.wav`, quote: line.text } });
  }
  return facts;
}

// Distinct synthetic voices per speaker (Windows has two voices; pitch and rate make four).
const VOICE: Record<string, { voice: number; pitch: string; rate: string }> = {
  A: { voice: 1, pitch: "+0%", rate: "0%" },
  B: { voice: 0, pitch: "-10%", rate: "-5%" },
  C: { voice: 1, pitch: "+25%", rate: "-5%" },
  D: { voice: 0, pitch: "+15%", rate: "5%" },
};

function makeRecording(s: Scenario, outWav: string) {
  const lines = (s.recording ?? []).map((l) => ({ ...(VOICE[l.speaker] ?? VOICE.A), text: l.text }));
  const json = join(tmpdir(), `sp-rec-${s.id}.json`);
  writeFileSync(json, JSON.stringify(lines));
  const ps1 = join(import.meta.dirname, "tts.ps1");
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Json", json, "-Out", outWav], { stdio: "pipe" });
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  rmSync(ROOT, { recursive: true, force: true });
  for (const d of [PACKS, ANSWERS, LABELLER]) mkdirSync(d, { recursive: true });
  const scenarios = SET === "test" ? buildTestScenarios() : SET === "stress" ? buildTestScenarios(424242, 12, true) : SCENARIOS;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const p = await browser.newPage();
  const labelRows = ["meeting,director,place_to_check,physically_there_during_whole_meeting (yes/no/cannot_tell),note"];
  let seed = 1;
  let rulesDisagree = 0;

  for (const s of scenarios) {
    const style = s.style ?? DEFAULT_STYLE;
    const dir = join(PACKS, s.id);
    mkdirSync(join(dir, "travel"), { recursive: true });
    mkdirSync(join(dir, "stay"), { recursive: true });
    const docPaths: Record<string, string> = {};
    const nameOf = (id: string) => s.company.directors.find((d) => d.id === id)!.name;

    const mHtml = minutesHtml(s, style);
    if (style.minutes === "scan") await scannedPdf(p, mHtml, join(dir, "minutes.pdf"));
    else {
      await p.setContent(mHtml, { waitUntil: "load" });
      await p.pdf({ path: join(dir, "minutes.pdf"), format: "A4", printBackground: true });
    }

    for (const [id, items] of Object.entries(s.travel)) {
      const name = nameOf(id);
      for (const it of items) {
        if (it.type === "flight") {
          const tag = `${id}_${it.origin}-${it.dest}`;
          if (style.boardingPass === "eticket") {
            const rel = `${s.id}/travel/ETKT_${tag}.pdf`;
            await p.setContent(eticketHtml(name, it, style), { waitUntil: "load" });
            await p.pdf({ path: join(PACKS, rel), format: "A4", printBackground: true });
            docPaths[`${id}:${it.origin}-${it.dest}`] = rel;
          } else if (style.boardingPass === "photo" || style.boardingPass === "photo_bad") {
            const rel = `${s.id}/travel/PHOTO_BP_${tag}.jpg`;
            await photoOf(p, cardHtml(name, it, style), join(PACKS, rel), seed++, style.boardingPass === "photo_bad");
            docPaths[`${id}:${it.origin}-${it.dest}`] = rel;
          } else {
            const rel = `${s.id}/travel/BP_${tag}.png`;
            await p.setViewport({ width: 720, height: 340, deviceScaleFactor: 2 });
            await p.setContent(`<!doctype html><html><body style="margin:12px;background:#e9eef5">${cardHtml(name, it, style)}</body></html>`, { waitUntil: "load" });
            const el = await p.$("#card");
            await el!.screenshot({ path: join(PACKS, rel) as `${string}.png` });
            docPaths[`${id}:${it.origin}-${it.dest}`] = rel;
          }
        } else {
          const rel = `${s.id}/stay/folio_${id}_${it.placeCode.replace("CITY:", "")}.pdf`;
          await p.setContent(folioHtml(name, it, style), { waitUntil: "load" });
          await p.pdf({ path: join(PACKS, rel), format: "A4", printBackground: true });
          docPaths[`${id}:${it.placeCode}`] = rel;
        }
      }
    }

    if (s.recording?.length) makeRecording(s, join(dir, "recording.wav"));
    const facts = factsFor(s, docPaths);
    // The answer key comes from the independent oracle (scripts/oracle.ts), not from our engine. The engine is
    // still run on the TRUE facts as a check of the rules: any disagreement is printed and counted.
    const expected = { ...oracle(s), source: "independent oracle (scripts/oracle.ts)" };
    const engineOnTruth = evaluateMeeting(s.company, s.meeting, facts, s.jurisdiction);
    if (engineOnTruth.verdict !== expected.verdict) {
      rulesDisagree += 1;
      console.warn(`  !! ${s.id}: engine on true facts says ${engineOnTruth.verdict}, oracle says ${expected.verdict}`);
    }
    writeFileSync(join(ANSWERS, `${s.id}.json`), JSON.stringify({ scenario: { id: s.id, trap: s.trap, jurisdiction: s.jurisdiction, style }, company: s.company, meeting: s.meeting, facts, expected }, null, 2));
    for (const id of s.meeting.attendeeIds) labelRows.push(`${s.id},${nameOf(id)},${s.jurisdiction === "JE" ? "Jersey" : "Singapore"},,`);
    console.log(`${s.id}  ${s.jurisdiction}  ${expected.verdict.padEnd(6)}  [${style.minutes}/${style.boardingPass}/${style.folio}/${style.passengerName}]  ${s.trap}`);
  }
  await browser.close();

  writeFileSync(join(LABELLER, "labels_template.csv"), labelRows.join("\n") + "\n");
  writeFileSync(join(LABELLER, "INSTRUCTIONS.md"), `# Labeller instructions (about 1 hour)

Thank you for helping. All documents are fictional (stamped SPECIMEN). Open the "packs" folder. Each sub-folder is one board meeting: the minutes, plus travel documents (boarding passes, e-tickets, photos) and hotel documents.

For every row in labels_template.csv, answer ONE question using only the documents:
**Was this director physically in the named place (Jersey or Singapore) for the WHOLE meeting?**

- **yes**: the documents show they were there for the whole meeting (for example a hotel stay there covering the meeting, or arriving there before it and leaving after it).
- **no**: the documents show they were somewhere else, or on a plane, during any part of the meeting.
- **cannot_tell**: the documents do not show where they were.

Important:
- Do NOT trust what the minutes say about where a person was. Check the travel and hotel documents.
- Times on documents are LOCAL to where they were printed. Convert them to the meeting's local time before deciding (Dubai is 4 hours ahead of UTC, Singapore and Hong Kong 8, Jersey and London 0 in winter and 1 in summer, Paris 1 in winter and 2 in summer).
- Do not guess. Use "cannot_tell" if unsure, and add a short note.
- Please do not ask the builder for hints. Send back the filled-in CSV.
`);
  console.log(`
Done (${SET}). Packs: ${PACKS}
Answers (keep hidden from the labeller): ${ANSWERS}
Engine-on-truth vs independent oracle: ${rulesDisagree} disagreement(s).`);
}

// Only generate when run directly, so other scripts can reuse the document templates.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/generate-synthetic.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

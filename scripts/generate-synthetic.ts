// Generates fictional board-meeting packs: minutes (PDF), boarding passes (PNG), hotel folios (PDF),
// plus the hidden answers. Everything is stamped SPECIMEN. Run: npm run gen
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { evaluateMeeting } from "../src/engine/evaluate";
import type { Fact } from "../src/engine/types";
import { SCENARIOS, NAMES, type Scenario, type TravelItem } from "./scenarios";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = join(import.meta.dirname, "..", "synthetic", "generated");
const PACKS = join(ROOT, "packs");
const ANSWERS = join(ROOT, "answers");
const LABELLER = join(ROOT, "labeller");

const TZ: Record<string, { tz: string; city: string; airport?: string }> = {
  JER: { tz: "Europe/Jersey", city: "Jersey", airport: "Jersey Airport" },
  "CITY:STHELIER": { tz: "Europe/Jersey", city: "St Helier, Jersey" },
  LHR: { tz: "Europe/London", city: "London", airport: "London Heathrow" },
  DXB: { tz: "Asia/Dubai", city: "Dubai", airport: "Dubai International" },
  "CITY:DUBAI": { tz: "Asia/Dubai", city: "Dubai, UAE" },
  SIN: { tz: "Asia/Singapore", city: "Singapore", airport: "Singapore Changi" },
  "CITY:SINGAPORE": { tz: "Asia/Singapore", city: "Singapore" },
};

const pad = (n: number) => String(n).padStart(2, "0");
function local(utcIso: string, tz: string) {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("day")} ${g("month")} ${g("year")}`, time: `${g("hour")}:${g("minute")}`, zone: g("timeZoneName") };
}

const STAMP = `<div style="position:absolute;top:12px;right:16px;color:#b00020;border:2px solid #b00020;padding:2px 8px;font:700 11px Arial;letter-spacing:1px;opacity:.75">SPECIMEN — SYNTHETIC DOCUMENT</div>`;
const base = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
 body{font-family:Georgia,serif;margin:0;padding:44px 52px;color:#111;position:relative}
 h1{font-size:17px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}
 h2{font-size:13px;margin:20px 0 6px;text-transform:uppercase}
 table{border-collapse:collapse;width:100%;font-size:13px} td,th{border:1px solid #999;padding:6px 8px;text-align:left}
 p{font-size:13px;line-height:1.5;margin:6px 0}
</style></head><body>${STAMP}${body}</body></html>`;

function minutesHtml(s: Scenario): string {
  const mtz = s.meeting.venueCode ? (TZ[s.meeting.venueCode]?.tz ?? "UTC") : s.jurisdiction === "SG" ? "Asia/Singapore" : "Europe/Jersey";
  const st = local(s.meeting.startUtc, mtz);
  const en = local(s.meeting.endUtc, mtz);
  const place = s.meeting.mode === "virtual" ? "By video conference (no physical venue)" : s.meeting.venueCode ? (TZ[s.meeting.venueCode]?.city ?? "—") : "—";
  const rows = s.meeting.attendeeIds
    .map((id) => {
      const d = s.company.directors.find((x) => x.id === id)!;
      const role = d.isChair ? "Director and Chairman" : "Director";
      return `<tr><td>${d.name}</td><td>${role}</td><td>${s.minutesClaims[id]?.text ?? "—"}</td></tr>`;
    })
    .join("");
  const business = s.meeting.isStrategic
    ? `<p>The Board considered and <b>RESOLVED</b> to approve the Company's 2026–2028 investment strategy, to acquire a 40% interest in Meridian Logistics Ltd for USD 18,500,000, and to appoint the Company's bankers.</p>`
    : `<p>The Board received and noted the management accounts for the quarter and confirmed the next meeting date. No other business was transacted.</p>`;
  const recorded = s.meeting.minutesRecordStrategicDecisions ? "" : "";
  return base(`
   <h1>${s.company.name}</h1>
   <p><b>Minutes of a meeting of the Board of Directors</b></p>
   <p>Date: ${st.date} &nbsp; Time: ${st.time}–${en.time} (${st.zone}) &nbsp; Place: ${place}</p>
   <h2>Attendance</h2>
   <table><tr><th>Name</th><th>Capacity</th><th>Attended</th></tr>${rows}</table>
   <p>A quorum of ${s.company.quorumRequired} directors being present, the Chairman declared the meeting open.</p>
   <h2>Business</h2>${business}${recorded}
   <p>The minutes of this and all board meetings and the records of the Company are kept at the registered office of the Company${s.jurisdiction === "SG" ? " in Singapore" : " in St Helier, Jersey"}.</p>
   <p style="margin-top:40px">Signed: ______________________ Chairman</p>`);
}

function boardingPassHtml(name: string, f: Extract<TravelItem, { type: "flight" }>): string {
  const o = TZ[f.origin];
  const d = TZ[f.dest];
  const dep = local(f.departUtc, o.tz);
  const arr = local(f.arriveUtc, d.tz);
  return `<!doctype html><html><body style="margin:0;background:#e9eef5;font-family:Arial,sans-serif">
  <div id="card" style="position:relative;width:680px;height:300px;background:#fff;border-radius:14px;margin:12px;box-shadow:0 2px 8px #0003;overflow:hidden">
   <div style="background:#0b3d91;color:#fff;padding:12px 20px;font-weight:700;font-size:18px;display:flex;justify-content:space-between"><span>SAMPLE AIR ✈</span><span>BOARDING PASS</span></div>
   <div style="position:absolute;top:50px;right:14px;color:#b00020;border:2px solid #b00020;padding:2px 6px;font:700 10px Arial;opacity:.8">SPECIMEN — SYNTHETIC</div>
   <div style="padding:18px 20px;display:flex;gap:30px;align-items:center">
    <div><div style="font-size:11px;color:#666">FROM</div><div style="font-size:42px;font-weight:700">${f.origin}</div><div style="font-size:12px">${o.airport ?? o.city}</div></div>
    <div style="font-size:30px">→</div>
    <div><div style="font-size:11px;color:#666">TO</div><div style="font-size:42px;font-weight:700">${f.dest}</div><div style="font-size:12px">${d.airport ?? d.city}</div></div>
   </div>
   <div style="padding:0 20px;display:flex;gap:34px;font-size:13px">
    <div><div style="color:#666;font-size:11px">PASSENGER</div><b>${name.toUpperCase()}</b></div>
    <div><div style="color:#666;font-size:11px">FLIGHT</div><b>${f.flightNo}</b></div>
    <div><div style="color:#666;font-size:11px">DATE</div><b>${dep.date}</b></div>
    <div><div style="color:#666;font-size:11px">DEPARTS (local ${dep.zone})</div><b>${dep.time}</b></div>
    <div><div style="color:#666;font-size:11px">ARRIVES (local ${arr.zone})</div><b>${arr.time}${arr.date !== dep.date ? " (" + arr.date + ")" : ""}</b></div>
   </div>
  </div></body></html>`;
}

function folioHtml(name: string, st: Extract<TravelItem, { type: "stay" }>): string {
  const tz = TZ[st.placeCode].tz;
  const a = local(st.fromUtc, tz);
  const b = local(st.toUtc, tz);
  return base(`
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
  return facts;
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  for (const d of [PACKS, ANSWERS, LABELLER]) mkdirSync(d, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const labelRows: string[] = ["meeting,director,jurisdiction_to_check,physically_in_jurisdiction_during_meeting (yes/no/cannot_tell),note"];

  for (const s of SCENARIOS) {
    const dir = join(PACKS, s.id);
    mkdirSync(join(dir, "travel"), { recursive: true });
    mkdirSync(join(dir, "stay"), { recursive: true });
    const docPaths: Record<string, string> = {};

    await page.setContent(minutesHtml(s), { waitUntil: "load" });
    await page.pdf({ path: join(dir, "minutes.pdf"), format: "A4", printBackground: true });

    for (const [id, items] of Object.entries(s.travel)) {
      const name = NAMES[id];
      for (const it of items) {
        if (it.type === "flight") {
          const rel = `${s.id}/travel/BP_${id}_${it.origin}-${it.dest}.png`;
          docPaths[`${id}:${it.origin}-${it.dest}`] = rel;
          await page.setViewport({ width: 720, height: 340, deviceScaleFactor: 2 });
          await page.setContent(boardingPassHtml(name, it), { waitUntil: "load" });
          const el = await page.$("#card");
          await el!.screenshot({ path: join(PACKS, rel) as `${string}.png` });
        } else {
          const tag = it.placeCode.replace("CITY:", "");
          const rel = `${s.id}/stay/folio_${id}_${tag}.pdf`;
          docPaths[`${id}:${it.placeCode}`] = rel;
          await page.setContent(folioHtml(name, it), { waitUntil: "load" });
          await page.pdf({ path: join(PACKS, rel), format: "A4", printBackground: true });
        }
      }
    }

    const facts = factsFor(s, docPaths);
    const evaluation = evaluateMeeting(s.company, s.meeting, facts, s.jurisdiction);
    writeFileSync(join(ANSWERS, `${s.id}.json`), JSON.stringify({ scenario: { id: s.id, trap: s.trap, jurisdiction: s.jurisdiction }, company: s.company, meeting: s.meeting, facts, expected: evaluation }, null, 2));
    for (const id of s.meeting.attendeeIds) {
      labelRows.push(`${s.id},${NAMES[id]},${s.jurisdiction === "JE" ? "Jersey" : "Singapore"},,`);
    }
    console.log(`${s.id}  ${s.jurisdiction}  ${evaluation.verdict.padEnd(6)}  ${s.trap}`);
  }
  await browser.close();

  writeFileSync(join(LABELLER, "labels_template.csv"), labelRows.join("\n") + "\n");
  writeFileSync(
    join(LABELLER, "INSTRUCTIONS.md"),
    `# Labeller instructions (about 1 hour)

All documents are fictional (stamped SPECIMEN). For each meeting folder in "packs", open the minutes and the travel / stay documents.

For every row in labels_template.csv, answer ONE thing using only the documents:
**Was this director physically in the named place (Jersey or Singapore) during the whole meeting?**

- yes — the documents show they were there during the whole meeting
- no — the documents show they were elsewhere, or in the air, during any part of the meeting
- cannot_tell — the documents do not show where they were (do NOT guess, and do NOT trust what the minutes say about their own location; check the flight and hotel documents)

Times on the documents are LOCAL times. Convert to the meeting's time before deciding. Add a short note if something is unclear.
Do not ask the builder for hints. Send back the filled-in CSV.
`,
  );
  console.log(`\nDone. Packs: ${PACKS}\nAnswers (keep hidden from labeller): ${ANSWERS}\nLabeller files: ${LABELLER}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

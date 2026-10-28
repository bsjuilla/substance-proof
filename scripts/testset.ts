// Held-out TEST set: randomised scenarios with varied document styles. Never used for tuning.
// Seeded, so the same set is rebuilt every time. All people and companies are fictional.
import type { Company, Director, Meeting } from "../src/engine/types";
import type { DocStyle, Scenario, TravelItem } from "./scenarios";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_POOL = [
  "Helena Brookfield", "Marcus Oyelaran", "Priya Anand-Lowe", "Tomasz Wierzba", "Isabel Carrow", "Kenji Halloran",
  "Fatima Zahra Bennis", "Oliver Strand", "Lucia Ferrante", "Samuel Achterberg", "Mei Lin Tavernier", "Rafael Quintero",
  "Ana Sokolova", "Daniel Mbeki-Shaw", "Grace Whitlock", "Hugo Lindqvist",
];
const COMPANY_POOL = [
  "Harbourline Holdings", "Corbel Capital", "Saltmarsh Investments", "Ardent Ridge", "Larkspur Ventures", "Pelagos Group",
  "Thornbury Assets", "Calloway Partners", "Meridian Bay", "Quillon Holdings",
];

type Home = { j: "JE" | "SG"; airport: string; city: string; cityCode: string };
const HOMES: Home[] = [
  { j: "JE", airport: "JER", city: "St Helier, Jersey", cityCode: "CITY:STHELIER" },
  { j: "SG", airport: "SIN", city: "Singapore", cityCode: "CITY:SINGAPORE" },
];
// Elsewhere: place a director could really be. Airport, city text, city code.
const AWAY = [
  { airport: "DXB", city: "Dubai, UAE", cityCode: "CITY:DUBAI" },
  { airport: "LHR", city: "London, United Kingdom", cityCode: "CITY:LONDON" },
  { airport: "HKG", city: "Hong Kong", cityCode: "CITY:HONGKONG" },
  { airport: "CDG", city: "Paris, France", cityCode: "CITY:PARIS" },
];

type Situation = "stay_in" | "bracket_in" | "stay_out" | "flight_during" | "late_arrival" | "none";
const SITUATIONS: Situation[] = ["stay_in", "stay_in", "bracket_in", "stay_out", "stay_out", "flight_during", "late_arrival", "none"];

const H = 3600_000;
// Documents print times to the minute, so the answer key is floored to the minute as well.
const iso = (t: number) => new Date(Math.floor(t / 60_000) * 60_000).toISOString().replace(".000Z", "Z");

export function buildTestScenarios(seed = 20261028, n = 30): Scenario[] {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: Scenario[] = [];

  for (let i = 0; i < n; i++) {
    const id = `t${String(i + 1).padStart(2, "0")}`;
    const home = i % 3 === 2 ? HOMES[1] : HOMES[0]; // about 1/3 Singapore
    const nDir = 2 + Math.floor(r() * 3); // 2-4 directors
    const names = [...NAME_POOL].sort(() => r() - 0.5).slice(0, nDir);
    const ids = names.map((_, k) => String.fromCharCode(65 + k));
    const chairId = home.j === "SG" || r() < 0.5 ? ids[0] : undefined;
    const directors: Director[] = ids.map((d, k) => ({
      id: d,
      name: names[k],
      hasStrategicAuthority: k === nDir - 1 && nDir >= 4 ? r() < 0.5 : true,
      isChair: d === chairId,
    }));
    const company: Company = {
      id: `CO-${id}`,
      name: `${pick(COMPANY_POOL)} ${home.j === "SG" ? "Pte Ltd" : "(Jersey) Limited"}`,
      directors,
      quorumRequired: nDir === 2 ? 2 : 2,
      options: {},
    };

    // Meeting in UTC (documents print it in local time, so summer-time Jersey meetings show BST).
    const month = 1 + Math.floor(r() * 9); // JS month index 1-9 = Feb-Oct, avoids the year boundary
    const day = 3 + Math.floor(r() * 24);
    const startUtc = home.j === "JE" ? Date.UTC(2026, month, day, 9, 0) : Date.UTC(2026, month, day, 2, 0);
    const endUtc = startUtc + 2 * H;
    const S = startUtc, E = endUtc;

    const travel: Record<string, TravelItem[]> = {};
    const claims: Scenario["minutesClaims"] = {};
    const traps: string[] = [];
    let anyRemoteHonest = false;

    for (const d of directors) {
      const sit = pick(SITUATIONS);
      const away = pick(AWAY);
      const fl = () => `SA ${100 + Math.floor(r() * 800)}`;
      const items: TravelItem[] = [];
      if (sit === "stay_in") {
        items.push({ type: "stay", placeCode: home.cityCode, city: home.city, fromUtc: iso(S - (14 + r() * 20) * H), toUtc: iso(E + (18 + r() * 30) * H) });
      } else if (sit === "bracket_in") {
        items.push({ type: "flight", origin: away.airport, dest: home.airport, departUtc: iso(S - 14 * H), arriveUtc: iso(S - (2 + r() * 6) * H), flightNo: fl() });
        items.push({ type: "flight", origin: home.airport, dest: away.airport, departUtc: iso(E + (2 + r() * 8) * H), arriveUtc: iso(E + 16 * H), flightNo: fl() });
      } else if (sit === "stay_out") {
        items.push({ type: "stay", placeCode: away.cityCode, city: away.city, fromUtc: iso(S - (20 + r() * 30) * H), toUtc: iso(E + (10 + r() * 30) * H) });
      } else if (sit === "flight_during") {
        const dep = S + (0.4 + r() * 1.2) * H; // leaves before the meeting ends
        items.push({ type: "flight", origin: home.airport, dest: away.airport, departUtc: iso(dep), arriveUtc: iso(dep + 7 * H), flightNo: fl() });
      } else if (sit === "late_arrival") {
        const arr = S + (0.3 + r() * 1.2) * H; // lands after the meeting started
        items.push({ type: "flight", origin: away.airport, dest: home.airport, departUtc: iso(arr - 7 * H), arriveUtc: iso(arr), flightNo: fl() });
      }
      if (items.length) travel[d.id] = items;

      const present = sit === "stay_in" || sit === "bracket_in";
      const homeShort = home.j === "JE" ? "St Helier" : "Singapore";
      if (present || sit === "none" || r() < 0.55) {
        // claims presence: true for present ones, FALSE (planted contradiction) otherwise
        claims[d.id] = { text: `present in ${homeShort}`, placeCode: home.cityCode };
        if (!present && sit !== "none") traps.push(`${d.name} claimed present but ${sit.replace("_", " ")}`);
      } else {
        const where = away.city.split(",")[0];
        claims[d.id] = { text: `by video from ${where}`, placeCode: away.cityCode };
        anyRemoteHonest = true;
      }
      if (sit === "none") traps.push(`no evidence for ${d.name}`);
      if (sit === "flight_during" || sit === "late_arrival") traps.push(`${d.name}: ${sit.replace("_", " ")} (time-zone check)`);
    }

    const meeting: Meeting = {
      id,
      startUtc: iso(S),
      endUtc: iso(E),
      mode: home.j === "SG" ? (r() < 0.5 ? "virtual" : "hybrid") : anyRemoteHonest ? "hybrid" : "in_person",
      venueCode: undefined,
      attendeeIds: ids,
      chairId,
      isStrategic: r() < 0.5,
      minutesRecordStrategicDecisions: true,
      minutesAndRecordsKeptInJurisdiction: true,
    };
    if (meeting.mode !== "virtual") meeting.venueCode = home.cityCode;

    const style: DocStyle = {
      boardingPass: pick(["card", "eticket", "photo"]),
      folio: pick(["table", "letter"]),
      minutes: pick(["table", "prose", "scan"]),
      passengerName: pick(["normal", "airline"]),
    };

    out.push({
      id,
      jurisdiction: home.j,
      trap: traps.length ? traps.join("; ") : "no traps",
      style,
      company,
      meeting,
      minutesClaims: claims,
      travel,
    });
  }
  return out;
}

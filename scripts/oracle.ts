// The answer key, written independently of the engine.
//
// An external review rightly pointed out that the expected verdicts used to be computed by running OUR OWN
// engine on the true facts, so "30/30 verdicts" only proved the reading, not the rules. This file is a second,
// deliberately simple implementation written from the scenario's intent and the rules as summarised in the
// README. It imports nothing from src/engine. The generator stores its answer as the key, and also reports
// any meeting where the engine, given the TRUE facts, disagrees with it (a check of the rules themselves).
import type { Scenario, TravelItem } from "./scenarios";

type Status = "present" | "absent" | "unknown";
const HOME_AIRPORT: Record<string, string> = { JE: "JER", SG: "SIN" };
// Place codes the scenarios use, mapped to their jurisdiction (kept here on purpose, separate from the gazetteer).
const COUNTRY: Record<string, string> = {
  JER: "JE", "CITY:STHELIER": "JE", SIN: "SG", "CITY:SINGAPORE": "SG", DXB: "AE", "CITY:DUBAI": "AE",
  LHR: "GB", LGW: "GB", "CITY:LONDON": "GB", HKG: "HK", "CITY:HONGKONG": "HK", CDG: "FR", "CITY:PARIS": "FR",
};
const t = (iso: string) => Date.parse(iso);
const H = 3_600_000;

/** Where was this director during the meeting, from the planted travel only. */
function whereWas(items: TravelItem[], S: number, E: number, home: string): { status: Status; place?: string } {
  const flights = items.filter((i): i is Extract<TravelItem, { type: "flight" }> => i.type === "flight");
  const stays = items.filter((i): i is Extract<TravelItem, { type: "stay" }> => i.type === "stay");
  // In the air at any moment of the meeting: not there.
  if (flights.some((f) => t(f.departUtc) < E && t(f.arriveUtc) > S)) return { status: "absent", place: "air" };
  // A hotel stay covering the whole meeting places them.
  const stay = stays.find((s) => t(s.fromUtc) <= S && t(s.toUtc) >= E);
  if (stay) {
    const c = COUNTRY[stay.placeCode];
    return c === home ? { status: "present", place: c } : { status: c ? "absent" : "unknown", place: c };
  }
  // Flew in shortly before and out shortly after (within 72 hours each side), with no flight in between.
  const inbound = flights.filter((f) => f.dest === HOME_AIRPORT[home] && t(f.arriveUtc) <= S && S - t(f.arriveUtc) <= 72 * H);
  const outbound = flights.filter((f) => f.origin === HOME_AIRPORT[home] && t(f.departUtc) >= E && t(f.departUtc) - E <= 72 * H);
  if (inbound.length && outbound.length) {
    const lastIn = Math.max(...inbound.map((f) => t(f.arriveUtc)));
    const firstOut = Math.min(...outbound.map((f) => t(f.departUtc)));
    const between = flights.some((f) => t(f.departUtc) > lastIn && t(f.departUtc) < firstOut);
    if (!between) return { status: "present", place: home };
  }
  return { status: "unknown" };
}

export type OracleAnswer = {
  verdict: "PASS" | "REVIEW" | "FAIL";
  presence: { directorId: string; status: Status }[];
  contradictions: { directorId: string }[];
  why: string;
};

export function oracle(s: Scenario): OracleAnswer {
  const S = t(s.meeting.startUtc);
  const E = t(s.meeting.endUtc);
  const home = s.jurisdiction;
  const presence = s.company.directors.map((d) => ({ directorId: d.id, ...whereWas(s.travel[d.id] ?? [], S, E, home) }));
  const statusOf = (id: string) => presence.find((p) => p.directorId === id)!.status;

  // Contradiction: the minutes or the recording put the director somewhere the evidence says they were not.
  const claimedPlaces = (id: string) => [
    s.minutesClaims[id]?.placeCode,
    ...(s.recording ?? []).filter((l) => l.speaker === id && l.claim).map((l) => l.claim),
  ].filter(Boolean).map((p) => COUNTRY[p!]).filter(Boolean);
  const contradictions = presence
    .filter((p) => p.status !== "unknown")
    .filter((p) => claimedPlaces(p.directorId).some((c) => (p.place === "air" ? true : c !== p.place)))
    .map((p) => ({ directorId: p.directorId }));

  // "At least n present", honest about unknowns: pass, fail (impossible even if every unknown was there), or open.
  const atLeast = (ids: string[], n: number): "pass" | "fail" | "open" => {
    const present = ids.filter((i) => statusOf(i) === "present").length;
    const unknown = ids.filter((i) => statusOf(i) === "unknown").length;
    return present >= n ? "pass" : present + unknown < n ? "fail" : "open";
  };

  const law: ("pass" | "fail" | "open")[] = [];
  const other: ("pass" | "fail" | "open")[] = [];
  const m = s.meeting;
  const dirs = s.company.directors;
  if (home === "JE") {
    if (dirs.length === 1) other.push(atLeast(m.attendeeIds, 1)); // sole director: guidance
    else law.push(atLeast(m.attendeeIds, s.company.quorumRequired)); // Art. 5(3)(b)
    if (m.isStrategic) law.push(m.minutesRecordStrategicDecisions === undefined ? "open" : m.minutesRecordStrategicDecisions ? "pass" : "fail"); // 5(3)(c)
    law.push(m.minutesAndRecordsKeptInJurisdiction === undefined ? "open" : m.minutesAndRecordsKeptInJurisdiction ? "pass" : "fail"); // 5(3)(e)
    if (dirs.length > 1 && m.isStrategic && (s.company.options?.jerseyMajorityDirectorsForStrategic ?? true)) {
      other.push(atLeast(dirs.map((d) => d.id), Math.floor(dirs.length / 2) + 1)); // guidance: majority of all directors
    }
  } else if (m.mode === "virtual" || m.mode === "hybrid") {
    const strategic = dirs.filter((d) => d.hasStrategicAuthority).map((d) => d.id);
    const fifty = strategic.length ? atLeast(strategic, Math.ceil(strategic.length / 2)) : "open";
    const chair = dirs.find((d) => d.isChair)?.id;
    const chairSt = chair ? (statusOf(chair) === "present" ? "pass" : statusOf(chair) === "absent" ? "fail" : "open") : "none";
    other.push(fifty === "pass" || chairSt === "pass" ? "pass" : fifty === "fail" && (chairSt === "fail" || chairSt === "none") ? "fail" : "open"); // IRAS indicator
  } else {
    const venue = m.venueCode ? COUNTRY[m.venueCode] : undefined;
    other.push(!venue ? "open" : venue !== "SG" ? "fail" : atLeast(m.attendeeIds, s.company.quorumRequired)); // our labelled assumption
  }

  let verdict: OracleAnswer["verdict"] = "PASS";
  let why = "every test met by independent evidence and no claim contradicted";
  if (law.includes("fail")) { verdict = "FAIL"; why = "a test in the law is not met"; }
  else if ([...law, ...other].some((x) => x !== "pass")) { verdict = "REVIEW"; why = "a test is not met at guidance level or cannot be proven"; }
  else if (contradictions.length) { verdict = "REVIEW"; why = "a claim in the minutes or recording is contradicted"; }

  return { verdict, presence: presence.map(({ directorId, status }) => ({ directorId, status })), contradictions, why };
}

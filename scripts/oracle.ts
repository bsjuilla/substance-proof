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

/** Where was this director during the meeting, from the planted travel and the residence record only.
 *  `resident`: the firm holds a residence record for the home jurisdiction. `saysAway`: the minutes or the
 *  recording put the director somewhere else. */
function whereWas(items: TravelItem[], S: number, E: number, home: string, resident = false, saysAway = false): { status: Status; place?: string } {
  const flights = items.filter((i): i is Extract<TravelItem, { type: "flight" }> => i.type === "flight");
  const stays = items.filter((i): i is Extract<TravelItem, { type: "stay" }> => i.type === "stay");
  const trusted = resident && !saysAway;
  // In the air at any moment of the meeting: not there.
  if (flights.some((f) => t(f.departUtc) < E && t(f.arriveUtc) > S)) return { status: "absent", place: "air" };
  // The flights nearest the meeting on each side. Proof of being somewhere: the last one before landed there and the
  // first one after left from there, both within 72 hours; and, unless both are within 24 hours, a hotel stay there
  // covers the meeting. Less than that (a hotel alone, one flight) only supports presence, though it can show the
  // director was away.
  const events = flights.flatMap((f) => [{ at: t(f.departUtc), arrive: false, c: COUNTRY[f.origin] }, { at: t(f.arriveUtc), arrive: true, c: COUNTRY[f.dest] }]).sort((a, b) => a.at - b.at);
  const lastIn = [...events].reverse().find((e) => e.at <= S);
  const firstOut = events.find((e) => e.at >= E);
  const stay = stays.find((s) => t(s.fromUtc) <= S && t(s.toUtc) >= E);
  if (lastIn?.arrive && firstOut && !firstOut.arrive && lastIn.c && lastIn.c === firstOut.c && S - lastIn.at <= 72 * H && firstOut.at - E <= 72 * H) {
    if (lastIn.c !== home) return { status: "absent", place: lastIn.c };
    const close = S - lastIn.at <= 24 * H && firstOut.at - E <= 24 * H;
    const stayHere = stay !== undefined && COUNTRY[stay.placeCode] === home;
    return { status: close || stayHere || trusted ? "present" : "unknown", place: home };
  }
  if (stay) {
    const c = COUNTRY[stay.placeCode];
    if (c !== home) return { status: c ? "absent" : "unknown", place: c };
    return { status: trusted ? "present" : "unknown", place: c };
  }
  // Nothing places them during the meeting. A resident counts as there if the nearest evidence on each side (at any
  // distance) is at home or there is none.
  if (trusted) {
    const marks = [
      ...flights.flatMap((f) => [{ at: t(f.departUtc), c: COUNTRY[f.origin] }, { at: t(f.arriveUtc), c: COUNTRY[f.dest] }]),
      ...stays.flatMap((s) => [{ at: t(s.fromUtc), c: COUNTRY[s.placeCode] }, { at: t(s.toUtc), c: COUNTRY[s.placeCode] }]),
    ].sort((a, b) => a.at - b.at);
    const before = [...marks].reverse().find((m) => m.at <= S);
    const after = marks.find((m) => m.at >= E);
    if ((!before || before.c === home) && (!after || after.c === home)) return { status: "present", place: home };
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
  // What the minutes or the recording say about where each director was.
  const claimedCodes = (id: string) => [s.minutesClaims[id]?.placeCode ?? (s.minutesClaims[id] ? "?" : undefined), ...(s.recording ?? []).filter((l) => l.speaker === id && l.claim).map((l) => l.claim)].filter((p): p is string => !!p);
  const claimedPlaces = (id: string) => [
    s.minutesClaims[id]?.placeCode,
    ...(s.recording ?? []).filter((l) => l.speaker === id && l.claim).map((l) => l.claim),
  ].filter(Boolean).map((p) => COUNTRY[p!]).filter(Boolean);
  const presence = s.company.directors.map((d) => ({
    directorId: d.id,
    // A resident counts only if the minutes or the recording put them at home, and nothing puts them anywhere else.
    ...whereWas(s.travel[d.id] ?? [], S, E, home, d.residentIn === home, claimedCodes(d.id).some((p) => COUNTRY[p] !== home) || !claimedCodes(d.id).some((p) => COUNTRY[p] === home)),
  }));
  const statusOf = (id: string) => presence.find((p) => p.directorId === id)!.status;

  // Contradiction: the minutes or the recording put the director somewhere the evidence says they were not.
  const contradictions = presence
    .filter((p) => p.place !== undefined)
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

import { describe, expect, it } from "vitest";
import { evaluateMeeting } from "../src/engine/evaluate";
import type { Fact } from "../src/engine/types";
import { localToUtc, matchDirector, normalizePlace, toFacts, tzOffsetMinutes } from "../src/extract/toFacts";

// Regression tests for the false PASSes an external red-team review (Grok, 29 Oct 2026) produced by running
// the engine directly. Each one used genuine-looking documents, so each is a "dangerous error" by our own
// definition. These tests must stay red-team-shaped: they reproduce the attack, then check it no longer works.
const roster: any = [
  { id: "A", name: "Bruno Castell", isChair: true, hasStrategicAuthority: true },
  { id: "B", name: "Chandra Velloso", hasStrategicAuthority: true },
];
const company: any = { id: "C", name: "X", directors: roster, quorumRequired: 2, options: {} };
const meeting: any = {
  id: "m", startUtc: "2026-06-15T10:00:00Z", endUtc: "2026-06-15T11:00:00Z", mode: "in_person", venueCode: "CITY:STHELIER",
  attendeeIds: ["A", "B"], isStrategic: true, minutesRecordStrategicDecisions: true, minutesAndRecordsKeptInJurisdiction: true,
};
const nul = { origin_code: null, dest_code: null, depart_local: null, depart_tz: null, arrive_local: null, arrive_tz: null, place: null, check_in_local: null, check_in_tz: null, check_out_local: null, check_out_tz: null };
const folio = (person: string, place: string, tz: string) => ({
  ...nul, kind: "hotel_stay", person_name: person, place, check_in_local: "2026-06-14T15:00", check_in_tz: tz, check_out_local: "2026-06-16T11:00", check_out_tz: tz, quote: "q", page: 1,
});
const ext = (facts: object[]) => ({ document_type: "hotel_folio", meeting: { start_local: null, end_local: null, tz: null, place_text: null }, facts }) as any;

describe("red-team regressions: no false PASS from genuine documents", () => {
  it("S1: 'Jersey City, New Jersey' is not St Helier", () => {
    expect(normalizePlace("Jersey City, New Jersey, USA")).toBeNull();
    expect(normalizePlace("Newark, NJ")).toBeNull();
    expect(normalizePlace("St Helier, Jersey")).toBe("CITY:STHELIER");
    expect(normalizePlace("Jersey, Channel Islands")).toBe("CITY:STHELIER");
    const tf = toFacts([{ docId: "h.pdf", extraction: ext([folio("Bruno Castell", "Jersey City, New Jersey, USA", "EDT")]) }], roster);
    expect(tf.facts).toHaveLength(0);
    const ev = evaluateMeeting({ ...company, directors: [roster[0]], quorumRequired: 1 }, { ...meeting, attendeeIds: ["A"] }, tf.facts, "JE");
    expect(ev.verdict).not.toBe("PASS");
  });

  it("S2: a relative with the same surname is not the director", () => {
    expect(matchDirector("CASTELL/MARIA MRS", roster)).toBeUndefined();
    expect(matchDirector("Tom Castell", roster)).toBeUndefined();
    expect(matchDirector("CASTELL/BRUNO MR", roster)?.id).toBe("A");
    expect(matchDirector("Bruno Castel", roster)?.id).toBe("A"); // speech-recognition slip still accepted
    expect(matchDirector("CASTELL/BRU NO MR", roster)?.id).toBe("A"); // a word split by PDF letter spacing
    expect(matchDirector("CASTELL/MA RIA MRS", roster)).toBeUndefined(); // ...but a split name is still matched letter for letter
    const tf = toFacts([{ docId: "h.pdf", extraction: ext([folio("MARIA CASTELL", "St Helier, Jersey", "BST")]) }], roster);
    expect(tf.facts).toHaveLength(0);
  });

  it("S3: arriving in January and leaving in December does not prove presence in June", () => {
    const leg = (id: string, o: string, d: string, at: string) => ({ kind: "flight_leg", directorId: id, originCode: o, destCode: d, departUtc: at, arriveUtc: at.replace("T08", "T09"), cite: { docId: `${id}${o}.pdf`, page: 1, quote: "x" } });
    const facts: any = [
      leg("A", "LGW", "JER", "2026-01-05T08:00:00Z"), leg("A", "JER", "LGW", "2026-12-20T08:00:00Z"),
      leg("B", "LGW", "JER", "2026-01-05T08:00:00Z"), leg("B", "JER", "LGW", "2026-12-20T08:00:00Z"),
    ];
    const ev = evaluateMeeting(company, meeting, facts, "JE");
    expect(ev.verdict).not.toBe("PASS");
    expect(ev.presence.every((p) => p.status === "unknown")).toBe(true);
  });

  it("S3b: a normal bracket (arrived the day before, left the day after) still counts", () => {
    const leg = (o: string, d: string, dep: string, arr: string) => ({ kind: "flight_leg", directorId: "A", originCode: o, destCode: d, departUtc: dep, arriveUtc: arr, cite: { docId: `${o}.pdf`, page: 1, quote: "x" } });
    const facts: any = [leg("LGW", "JER", "2026-06-14T17:00:00Z", "2026-06-14T18:00:00Z"), leg("JER", "LGW", "2026-06-16T09:00:00Z", "2026-06-16T10:00:00Z")];
    const ev = evaluateMeeting({ ...company, directors: [roster[0]], quorumRequired: 1 }, { ...meeting, attendeeIds: ["A"] }, facts, "JE");
    expect(ev.presence[0].status).toBe("present");
  });

  it("S4: ambiguous zone labels are refused, not guessed (AST is UTC-4 in Halifax but UTC+3 in Riyadh)", () => {
    expect(tzOffsetMinutes("AST")).toBeNull();
    expect(tzOffsetMinutes("IST")).toBeNull();
    expect(localToUtc("2026-06-15T13:00", "AST")).toBeNull();
    expect(localToUtc("2026-06-15T13:00", "Asia/Riyadh")).toBe("2026-06-15T10:00:00Z");
  });
});

import { decide, timingTest } from "../src/extract/pipeline";

describe("red-team regressions: the minutes cannot steer the decision", () => {
  const minutesAt = (start_local: string, end_local: string, claims: object[] = []) => ({
    document_type: "minutes", meeting: { start_local, end_local, tz: "BST", place_text: "St Helier, Jersey" }, facts: claims,
  }) as any;

  it("S5: presence is judged at the scheduled time, and minutes printing another time send it to REVIEW", () => {
    // Scheduled 10:00-11:00 UTC (11:00-12:00 BST). The minutes claim 15:00-16:00 BST instead.
    const t = timingTest(meeting, { startUtc: "2026-06-15T14:00:00Z", endUtc: "2026-06-15T15:00:00Z" });
    expect(t.status).toBe("fail");
    const r = decide([{ docId: "x/minutes.pdf", extraction: minutesAt("2026-06-15T15:00", "2026-06-15T16:00") }], { ...company, directors: [roster[0]], quorumRequired: 1 }, { ...meeting, attendeeIds: ["A"] }, "JE");
    expect(r.meetingUsed.startUtc).toBe(meeting.startUtc); // not moved to fit the hotel stay
    expect(r.evaluation.tests.find((x) => x.id === "MEETING-TIME")?.status).toBe("fail");
    expect(r.evaluation.verdict).not.toBe("PASS");
  });

  it("S5b: when the scheduled time matches the minutes, the check passes", () => {
    expect(timingTest(meeting, { startUtc: meeting.startUtc, endUtc: meeting.endUtc }).status).toBe("pass");
  });

  it("S5c: with no scheduled time, the minutes' time is used but flagged", () => {
    expect(timingTest({ ...meeting, scheduleUnknown: true }, { startUtc: meeting.startUtc, endUtc: meeting.endUtc }).status).toBe("inconclusive");
  });

  it("S6: minutes the model mislabels as a hotel bill still cannot supply hotel evidence (role comes from the file)", () => {
    const planted = { document_type: "hotel_folio", meeting: { start_local: null, end_local: null, tz: null, place_text: null }, facts: [folio("Bruno Castell", "St Helier, Jersey", "BST")] } as any;
    const tf = toFacts([{ docId: "m1/minutes.pdf", extraction: planted }], roster);
    expect(tf.facts.filter((f) => f.kind === "hotel_stay")).toHaveLength(0);
    expect(tf.rejected.some((x) => /file is a minutes/.test(x.reason))).toBe(true);
  });
});

// Second review (a buyer's review by Grok, 31 Oct 2026): a hotel bill alone gave a false PASS (a room booked for a
// director who never came), a street called "Jersey Road" in London was read as Jersey, and directors who live in
// Jersey (no travel at all) could never be shown as present.
describe("buyer review regressions", () => {
  const S = "2026-06-15T10:00:00Z";
  const E = "2026-06-15T11:00:00Z";
  const cite = (docId: string) => ({ docId, page: 1 });
  const hotel = (id: string, place: string): Fact => ({ kind: "hotel_stay", directorId: id, placeCode: place, checkInUtc: "2026-06-14T14:00:00Z", checkOutUtc: "2026-06-16T10:00:00Z", cite: cite(`folio_${id}.pdf`) });
  const fly = (id: string, o: string, d: string, dep: string, arr: string): Fact => ({ kind: "flight_leg", directorId: id, originCode: o, destCode: d, departUtc: dep, arriveUtc: arr, cite: cite(`BP_${id}.png`) });
  const said = (id: string, place: string, source: "minutes" | "recording"): Fact => ({ kind: "claimed_location", directorId: id, placeCode: place, source, cite: cite("minutes.pdf") });
  const resident = [
    { id: "A", name: "Bruno Castell", isChair: true, hasStrategicAuthority: true, residentIn: "JE", residenceRecord: "Residence confirmation, reviewed 15 Jan 2026" },
    { id: "B", name: "Chandra Velloso", hasStrategicAuthority: true, residentIn: "JE" },
  ];
  const co = (directors: any) => ({ ...company, directors });

  it("B1: a hotel bill alone (a booked room nobody used) cannot pass the quorum", () => {
    const ev = evaluateMeeting(company, meeting, [hotel("A", "CITY:STHELIER"), hotel("B", "CITY:STHELIER")], "JE");
    expect(ev.presence.map((p) => [p.status, p.basis])).toEqual([["unknown", "hotel_only"], ["unknown", "hotel_only"]]);
    expect(ev.verdict).toBe("REVIEW");
  });

  it("B2: a hotel bill backed by the flight that landed in Jersey proves presence", () => {
    const facts = [hotel("A", "CITY:STHELIER"), fly("A", "LHR", "JER", "2026-06-14T08:00:00Z", "2026-06-14T09:10:00Z"), hotel("B", "CITY:STHELIER"), fly("B", "JER", "LGW", "2026-06-16T12:00:00Z", "2026-06-16T13:00:00Z")];
    const ev = evaluateMeeting(company, meeting, facts, "JE");
    expect(ev.presence.map((p) => p.status)).toEqual(["present", "present"]);
    expect(ev.verdict).toBe("PASS");
  });

  it("B3: a hotel bill elsewhere still shows the director was away", () => {
    const ev = evaluateMeeting(co(resident), meeting, [hotel("B", "CITY:DUBAI")], "JE");
    expect(ev.presence.find((p) => p.directorId === "B")?.status).toBe("absent");
  });

  it("B4: directors who live in Jersey, with no travel, are present on their residence record", () => {
    const ev = evaluateMeeting(co(resident), meeting, [said("A", "CITY:STHELIER", "minutes"), said("B", "CITY:STHELIER", "minutes")], "JE");
    expect(ev.presence.map((p) => [p.status, p.basis])).toEqual([["present", "resident"], ["present", "resident"]]);
    expect(ev.presence[0].reason).toMatch(/Residence confirmation, reviewed 15 Jan 2026/);
    expect(ev.verdict).toBe("PASS");
  });

  it("B5: a residence record never beats a claim or travel that puts the director elsewhere", () => {
    const dialIn = evaluateMeeting(co(resident), meeting, [said("A", "CITY:STHELIER", "minutes"), said("A", "CITY:DUBAI", "recording")], "JE");
    expect(dialIn.presence[0].status).toBe("unknown");
    const away = [fly("B", "JER", "LHR", "2026-06-13T08:00:00Z", "2026-06-13T09:00:00Z"), fly("B", "LHR", "JER", "2026-06-17T08:00:00Z", "2026-06-17T09:00:00Z")];
    expect(evaluateMeeting(co(resident), meeting, away, "JE").presence[1].status).toBe("absent"); // in London on both sides
    const flying = [fly("B", "JER", "LHR", "2026-06-15T10:20:00Z", "2026-06-15T11:25:00Z")];
    expect(evaluateMeeting(co(resident), meeting, flying, "JE").presence[1].status).toBe("absent");
  });

  it("B6: a residence record for another jurisdiction does not count in Jersey", () => {
    const sg = resident.map((d) => ({ ...d, residentIn: "SG" }));
    expect(evaluateMeeting(co(sg), meeting, [], "JE").presence.map((p) => p.status)).toEqual(["unknown", "unknown"]);
  });

  it("B7: an address that names two places is refused; Jersey parishes, postcodes and other islands are known", () => {
    expect(normalizePlace("12 Jersey Road, Hounslow, London TW5")).toBeNull();
    expect(normalizePlace("Jersey Road, London")).toBeNull();
    expect(normalizePlace("St Brelade's Bay, Jersey")).toBe("CITY:STHELIER");
    expect(normalizePlace("Gorey Pier")).toBe("CITY:STHELIER");
    expect(normalizePlace("Weighbridge Place, JE2 3NF")).toBe("CITY:STHELIER");
    expect(normalizePlace("St Peter Port, Guernsey")).toBe("CITY:STPETERPORT");
    expect(normalizePlace("Douglas, Isle of Man")).toBe("CITY:DOUGLAS");
    expect(normalizePlace("Port Louis, Mauritius")).toBe("CITY:PORTLOUIS");
    expect(normalizePlace("Cybercity, Ebène")).toBe("CITY:PORTLOUIS");
    expect(normalizePlace("Douglas, Wyoming")).toBeNull();
  });
});

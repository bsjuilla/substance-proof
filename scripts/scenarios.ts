// Synthetic board-meeting scenarios. ALL data is fictional. Each scenario is a "trap" the extractor
// and the rules engine must handle. Ground truth (what really happened) is separate from what the
// minutes CLAIM, so contradictions can be planted on purpose.

import type { Company, Director, Meeting } from "../src/engine/types";

export type TravelItem =
  | { type: "stay"; placeCode: string; city: string; fromUtc: string; toUtc: string }
  | { type: "flight"; origin: string; dest: string; departUtc: string; arriveUtc: string; flightNo: string };

export type Scenario = {
  id: string;
  jurisdiction: "JE" | "SG";
  trap: string;
  company: Company;
  meeting: Meeting;
  /** What the minutes say about each attendee's location (a claim, not proof). */
  minutesClaims: Record<string, { text: string; placeCode?: string }>;
  /** Independent evidence per director. A director with no entry has NO evidence on file. */
  travel: Record<string, TravelItem[]>;
};

const NAMES: Record<string, string> = {
  A: "Alice Marlowe",
  B: "Bruno Castell",
  C: "Chandra Velloso",
  D: "Dmitri Ashby",
};

const dirs = (ids: string[], strategic = true, chair?: string): Director[] =>
  ids.map((id) => ({
    id,
    name: NAMES[id],
    hasStrategicAuthority: strategic,
    isChair: id === chair,
  }));

const JE_CO = (ids: string[], extra: Partial<Company> = {}): Company => ({
  id: "ACME-JE",
  name: "Acme Holdings (Jersey) Limited",
  directors: dirs(ids),
  quorumRequired: 2,
  options: {},
  ...extra,
});

const SG_CO = (): Company => ({
  id: "ACME-SG",
  name: "Northwind Capital Pte Ltd",
  directors: dirs(["A", "B", "C", "D"], true, "C"),
  quorumRequired: 2,
  options: {},
});

// Jersey is on GMT on 12 March 2026 (UTC+0). Dubai UTC+4. Singapore UTC+8.
const JE_START = "2026-03-12T09:00:00Z";
const JE_END = "2026-03-12T11:00:00Z";
const inJersey = (): TravelItem => ({ type: "stay", placeCode: "CITY:STHELIER", city: "St Helier, Jersey", fromUtc: "2026-03-11T15:00:00Z", toUtc: "2026-03-13T09:00:00Z" });
const inDubai = (): TravelItem => ({ type: "stay", placeCode: "CITY:DUBAI", city: "Dubai, UAE", fromUtc: "2026-03-10T20:00:00Z", toUtc: "2026-03-14T08:00:00Z" });
const inSingapore = (): TravelItem => ({ type: "stay", placeCode: "CITY:SINGAPORE", city: "Singapore", fromUtc: "2026-05-18T05:00:00Z", toUtc: "2026-05-21T02:00:00Z" });
const inDubaiMay = (): TravelItem => ({ type: "stay", placeCode: "CITY:DUBAI", city: "Dubai, UAE", fromUtc: "2026-05-16T20:00:00Z", toUtc: "2026-05-22T08:00:00Z" });

const jeMeeting = (id: string, over: Partial<Meeting> = {}, ids = ["A", "B", "C"]): Meeting => ({
  id,
  startUtc: JE_START,
  endUtc: JE_END,
  mode: "in_person",
  venueCode: "CITY:STHELIER",
  attendeeIds: ids,
  isStrategic: false,
  minutesRecordStrategicDecisions: true,
  minutesAndRecordsKeptInJurisdiction: true,
  ...over,
});

const claimJe = { text: "present in St Helier", placeCode: "CITY:STHELIER" };

export const SCENARIOS: Scenario[] = [
  {
    id: "m01",
    jurisdiction: "JE",
    trap: "Clean pass: all three directors in St Helier",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m01"),
    minutesClaims: { A: claimJe, B: claimJe, C: claimJe },
    travel: { A: [inJersey()], B: [inJersey()], C: [inJersey()] },
  },
  {
    id: "m02",
    jurisdiction: "JE",
    trap: "Honest video attendee: minutes say B joined from Dubai; quorum still met",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m02", { mode: "hybrid" }),
    minutesClaims: { A: claimJe, B: { text: "by video from Dubai", placeCode: "CITY:DUBAI" }, C: claimJe },
    travel: { A: [inJersey()], B: [inDubai()], C: [inJersey()] },
  },
  {
    id: "m03",
    jurisdiction: "JE",
    trap: "Contradiction: minutes say B was in St Helier but his flight left at 10:30 during the meeting",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m03"),
    minutesClaims: { A: claimJe, B: claimJe, C: claimJe },
    travel: {
      A: [inJersey()],
      B: [{ type: "flight", origin: "JER", dest: "LHR", departUtc: "2026-03-12T10:30:00Z", arriveUtc: "2026-03-12T11:45:00Z", flightNo: "SA 411" }],
      C: [inJersey()],
    },
  },
  {
    id: "m04",
    jurisdiction: "JE",
    trap: "Fail: minutes claim everyone in St Helier but only A was; B and C were in Dubai",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m04"),
    minutesClaims: { A: claimJe, B: claimJe, C: claimJe },
    travel: { A: [inJersey()], B: [inDubai()], C: [inDubai()] },
  },
  {
    id: "m05",
    jurisdiction: "JE",
    trap: "Missing evidence: nothing on file for B; A in Jersey, C in Dubai",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m05"),
    minutesClaims: { A: claimJe, B: claimJe, C: { text: "by video from Dubai", placeCode: "CITY:DUBAI" } },
    travel: { A: [inJersey()], C: [inDubai()] },
  },
  {
    id: "m06",
    jurisdiction: "JE",
    trap: "Timezone trap: B's Dubai departure is 14:30 local = 10:30 UTC, mid-meeting",
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m06"),
    minutesClaims: { A: claimJe, B: claimJe, C: claimJe },
    travel: {
      A: [inJersey()],
      B: [{ type: "flight", origin: "DXB", dest: "LHR", departUtc: "2026-03-12T10:30:00Z", arriveUtc: "2026-03-12T18:45:00Z", flightNo: "SA 118" }],
      C: [inJersey()],
    },
  },
  {
    id: "m07",
    jurisdiction: "JE",
    trap: "Strategic meeting, 4 directors: quorum met (2) but only 2 of 4 in Jersey, so the majority guidance test fails",
    company: JE_CO(["A", "B", "C", "D"]),
    meeting: jeMeeting("m07", { isStrategic: true }, ["A", "B", "C", "D"]),
    minutesClaims: { A: claimJe, B: claimJe, C: { text: "by video from Dubai", placeCode: "CITY:DUBAI" }, D: { text: "by video from Dubai", placeCode: "CITY:DUBAI" } },
    travel: { A: [inJersey()], B: [inJersey()], C: [inDubai()], D: [inDubai()] },
  },
  {
    id: "m08",
    jurisdiction: "SG",
    trap: "Virtual meeting: only 1 of 4 strategic directors in Singapore, but the chairman (C) is there",
    company: SG_CO(),
    meeting: {
      id: "m08",
      startUtc: "2026-05-19T02:00:00Z",
      endUtc: "2026-05-19T04:00:00Z",
      mode: "virtual",
      attendeeIds: ["A", "B", "C", "D"],
      chairId: "C",
      isStrategic: true,
      minutesRecordStrategicDecisions: true,
      minutesAndRecordsKeptInJurisdiction: true,
    },
    minutesClaims: {
      A: { text: "by video from Dubai", placeCode: "CITY:DUBAI" },
      B: { text: "by video from Dubai", placeCode: "CITY:DUBAI" },
      C: { text: "(Chairman) present in Singapore", placeCode: "CITY:SINGAPORE" },
      D: { text: "by video from Dubai", placeCode: "CITY:DUBAI" },
    },
    travel: { A: [inDubaiMay()], B: [inDubaiMay()], C: [inSingapore()], D: [inDubaiMay()] },
  },
  {
    id: "m09",
    jurisdiction: "SG",
    trap: "Virtual meeting fail: 1 of 4 in Singapore and the chairman is in Dubai",
    company: SG_CO(),
    meeting: {
      id: "m09",
      startUtc: "2026-05-19T02:00:00Z",
      endUtc: "2026-05-19T04:00:00Z",
      mode: "virtual",
      attendeeIds: ["A", "B", "C", "D"],
      chairId: "C",
      isStrategic: true,
      minutesRecordStrategicDecisions: true,
      minutesAndRecordsKeptInJurisdiction: true,
    },
    minutesClaims: {
      A: { text: "present in Singapore", placeCode: "CITY:SINGAPORE" },
      B: { text: "present in Singapore", placeCode: "CITY:SINGAPORE" },
      C: { text: "(Chairman) present in Singapore", placeCode: "CITY:SINGAPORE" },
      D: { text: "by video from Dubai", placeCode: "CITY:DUBAI" },
    },
    travel: { A: [inSingapore()], B: [inDubaiMay()], C: [inDubaiMay()], D: [inDubaiMay()] },
  },
  {
    id: "m10",
    jurisdiction: "SG",
    trap: "Exactly 50%: A and B in Singapore (B landed at 23:50 the night before, crossing midnight), C and D in Dubai",
    company: SG_CO(),
    meeting: {
      id: "m10",
      startUtc: "2026-05-19T02:00:00Z",
      endUtc: "2026-05-19T04:00:00Z",
      mode: "hybrid",
      venueCode: "CITY:SINGAPORE",
      attendeeIds: ["A", "B", "C", "D"],
      chairId: "C",
      isStrategic: true,
      minutesRecordStrategicDecisions: true,
      minutesAndRecordsKeptInJurisdiction: true,
    },
    minutesClaims: {
      A: { text: "present in Singapore", placeCode: "CITY:SINGAPORE" },
      B: { text: "present in Singapore", placeCode: "CITY:SINGAPORE" },
      C: { text: "(Chairman) by video from Dubai", placeCode: "CITY:DUBAI" },
      D: { text: "by video from Dubai", placeCode: "CITY:DUBAI" },
    },
    travel: {
      A: [inSingapore()],
      B: [
        { type: "flight", origin: "DXB", dest: "SIN", departUtc: "2026-05-18T08:30:00Z", arriveUtc: "2026-05-18T15:50:00Z", flightNo: "SA 77" },
        { type: "stay", placeCode: "CITY:SINGAPORE", city: "Singapore", fromUtc: "2026-05-18T16:30:00Z", toUtc: "2026-05-20T02:00:00Z" },
      ],
      C: [inDubaiMay()],
      D: [inDubaiMay()],
    },
  },
];

export { NAMES };

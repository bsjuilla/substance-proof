// Synthetic board-meeting scenarios. ALL data is fictional. Each scenario is a "trap" the extractor
// and the rules engine must handle. Ground truth (what really happened) is separate from what the
// minutes CLAIM, so contradictions can be planted on purpose.

import type { Company, Director, Meeting } from "../src/engine/types";

export type TravelItem =
  | { type: "stay"; placeCode: string; city: string; fromUtc: string; toUtc: string }
  | { type: "flight"; origin: string; dest: string; departUtc: string; arriveUtc: string; flightNo: string };

/** How the documents look. Varied in the held-out test set so the extractor cannot overfit one layout. */
export type DocStyle = {
  boardingPass: "card" | "eticket" | "photo" | "photo_bad";
  folio: "table" | "letter" | "french";
  minutes: "table" | "prose" | "scan" | "handwritten";
  passengerName: "normal" | "airline"; // "CASTELL/BRUNO MR"
  clock?: "24h" | "12h";
};

export type Scenario = {
  id: string;
  jurisdiction: "JE" | "SG";
  trap: string;
  style?: DocStyle;
  company: Company;
  meeting: Meeting;
  /** What the minutes say about each attendee's location (a claim, not proof). */
  minutesClaims: Record<string, { text: string; placeCode?: string }>;
  /** Independent evidence per director. A director with no entry has NO evidence on file. */
  travel: Record<string, TravelItem[]>;
  /** Optional meeting recording (synthetic voices). `claim` = where the speaker SAYS they are (truth for scoring). */
  recording?: { speaker: string; text: string; claim?: string }[];
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
  id: "QV-JE",
  name: "Quenvale Holdings (Jersey) Limited",
  directors: dirs(ids),
  quorumRequired: 2,
  options: {},
  ...extra,
});

const SG_CO = (): Company => ({
  id: "TR-SG",
  name: "Sennoway Capital Pte Ltd",
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
    recording: [
      { speaker: "A", text: "Good morning. Let's take the roll call. Please give your name and say where you are." },
      { speaker: "A", text: "Alice Marlowe, here in the boardroom in St Helier.", claim: "CITY:STHELIER" },
      { speaker: "B", text: "Bruno Castell. I'm joining by video from Dubai today.", claim: "CITY:DUBAI" },
      { speaker: "C", text: "Chandra Velloso, also in the room in St Helier.", claim: "CITY:STHELIER" },
      { speaker: "A", text: "Thank you. We are quorate. First item, the quarterly accounts." },
    ],
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
    trap: "Not met: minutes claim everyone in St Helier but only A was; B and C were in Dubai",
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
    recording: [
      { speaker: "A", text: "Shall we start? Roll call please, name and location." },
      { speaker: "A", text: "Alice Marlowe, St Helier.", claim: "CITY:STHELIER" },
      { speaker: "C", text: "Chandra Velloso, I'm in St Helier as well.", claim: "CITY:STHELIER" },
      { speaker: "B", text: "Bruno Castell here. Apologies for the noise, I'm at the gate at Dubai airport, boarding shortly.", claim: "CITY:DUBAI" },
      { speaker: "A", text: "Noted, Bruno. Let's move through the agenda quickly." },
    ],
  },
  {
    id: "m07",
    jurisdiction: "JE",
    trap: "Strategic meeting, 4 directors: quorum met (2) but only 2 of 4 in Jersey, so the majority guidance test is not met",
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
    trap: "Virtual meeting not met: 1 of 4 in Singapore and the chairman is in Dubai",
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
  {
    // HERO demo meeting. Minutes say all three directors were in St Helier for a strategic decision.
    // Evidence: only A was. B spoke from Dubai on the recording and stayed at a Dubai hotel.
    // C's e-ticket shows her still in the air from London until after the meeting ended.
    id: "m11",
    jurisdiction: "JE",
    trap: "HERO: minutes say all present in St Helier; recording and hotel put B in Dubai; C was still flying in from London. Quorum not met.",
    style: { boardingPass: "eticket", folio: "table", minutes: "table", passengerName: "airline" },
    company: JE_CO(["A", "B", "C"]),
    meeting: jeMeeting("m11", { isStrategic: true }),
    minutesClaims: { A: claimJe, B: claimJe, C: claimJe },
    travel: {
      A: [inJersey()],
      B: [inDubai()],
      C: [{ type: "flight", origin: "LHR", dest: "JER", departUtc: "2026-03-12T10:20:00Z", arriveUtc: "2026-03-12T11:25:00Z", flightNo: "SA 233" }],
    },
    recording: [
      { speaker: "A", text: "Good morning everyone. This is a strategic meeting, so a roll call for the record: name and where you are, please." },
      { speaker: "A", text: "Alice Marlowe, chairing from the boardroom in St Helier.", claim: "CITY:STHELIER" },
      { speaker: "B", text: "Bruno Castell. I'm dialling in from my hotel in Dubai, the line may be a little delayed.", claim: "CITY:DUBAI" },
      { speaker: "A", text: "And Chandra? Her flight from London hasn't landed yet, so we'll proceed without her." },
      { speaker: "A", text: "First item: the proposed acquisition of a forty per cent interest in Vantrell Logistics." },
    ],
  },
];

export { NAMES };

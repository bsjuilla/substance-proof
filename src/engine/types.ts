// Shared types for the Substance Proof rules engine.
// The AI layer only produces `Fact`s (what a document says). Everything below is deterministic.

export type JurisdictionCode = string; // ISO 3166-1 alpha-2 (JE, SG, AE, GB, ...)

export type Citation = {
  docId: string; // e.g. "minutes_2026-03-12.pdf"
  page?: number; // 1-based page for PDFs / images
  timestampSec?: number; // for audio
  quote?: string; // the exact string the fact was read from
};

export type Director = {
  id: string;
  name: string;
  isChair?: boolean;
  /** Has authority to make strategic decisions (Singapore 50% test counts only these). */
  hasStrategicAuthority: boolean;
};

/** A raw fact read out of a document (by the AI or, in tests, by hand). */
export type Fact =
  | {
      kind: "flight_leg";
      directorId: string;
      originCode: string; // IATA airport code, e.g. "LHR"
      destCode: string;
      departUtc: string; // ISO 8601 with offset or Z
      arriveUtc: string;
      cite: Citation;
    }
  | {
      kind: "hotel_stay";
      directorId: string;
      placeCode: string; // IATA-style city/airport code or "CITY:DUBAI"
      checkInUtc: string;
      checkOutUtc: string;
      cite: Citation;
    }
  | {
      /** The minutes (or a participant on the recording) CLAIM a location. A claim is not evidence. */
      kind: "claimed_location";
      directorId: string;
      placeCode: string;
      source: "minutes" | "recording" | "email";
      cite: Citation;
    };

export type MeetingMode = "in_person" | "hybrid" | "virtual";

export type Meeting = {
  id: string;
  startUtc: string;
  endUtc: string;
  mode: MeetingMode;
  /** Declared venue as a place code, if physical or hybrid. */
  venueCode?: string;
  attendeeIds: string[]; // directors who attended in any way
  chairId?: string;
  isStrategic: boolean; // decisions on strategic matters / core income-generating activities were taken
  minutesRecordStrategicDecisions: boolean;
  minutesAndRecordsKeptInJurisdiction?: boolean; // undefined = not provided
};

export type Company = {
  id: string;
  name: string;
  directors: Director[];
  quorumRequired: number; // from the articles
  /** Optional per-company assumptions the user can toggle. */
  options?: {
    jerseyMajorityOfMeetingsInJersey?: boolean; // guidance-level (default true)
    jerseyMajorityDirectorsForStrategic?: boolean; // guidance-level (default true)
    jerseyMinMeetingsPerYear?: number | null; // "adequate frequency" is not numeric in law; null = not assessed
  };
};

export type PresenceStatus = "present" | "absent" | "unknown";

export type PresenceResult = {
  directorId: string;
  status: PresenceStatus;
  /** Where the evidence puts them if absent (jurisdiction code), or undefined. */
  elsewhere?: JurisdictionCode;
  /** "independent" = travel or hotel evidence; "claim_only" = only minutes/recording say so. */
  basis: "independent" | "claim_only" | "none";
  reason: string;
  cites: Citation[];
  /** The minutes or recording claimed this jurisdiction but independent evidence disagrees. */
  contradiction?: { claimed: string; evidence: string };
  /** The minutes and the meeting recording disagree with each other about where this person was. */
  claimConflict?: { minutes: string; recording: string; cites: Citation[] };
};

export type TestStatus = "pass" | "fail" | "inconclusive" | "not_applicable";

export type TestResult = {
  id: string;
  label: string;
  status: TestStatus;
  /** "law" = the statute text. "regulator" = official guidance page. "guidance" = secondary summary (toggle). */
  basis: "law" | "regulator" | "guidance";
  citation: string; // human-readable rule citation, e.g. "Jersey ES Law 2019, Art. 5(3)(b)"
  detail: string;
};

export type MeetingVerdict = "PASS" | "FAIL" | "REVIEW";

export type MeetingEvaluation = {
  meetingId: string;
  jurisdiction: JurisdictionCode;
  verdict: MeetingVerdict;
  presence: PresenceResult[];
  tests: TestResult[];
  contradictions: PresenceResult[];
};

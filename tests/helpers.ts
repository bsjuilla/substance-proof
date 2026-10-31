import type { Company, Director, Fact, Meeting } from "../src/engine/types";

export const MEETING_START = "2026-03-12T09:00:00Z";
export const MEETING_END = "2026-03-12T11:00:00Z";

export function dir(id: string, opts: Partial<Director> = {}): Director {
  return { id, name: `Director ${id}`, hasStrategicAuthority: true, ...opts };
}

export function company(directors: Director[], quorumRequired = 2, options: Company["options"] = {}): Company {
  return { id: "co1", name: "Quenvale Holdings Ltd", directors, quorumRequired, options };
}

export function meeting(attendees: string[], over: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    startUtc: MEETING_START,
    endUtc: MEETING_END,
    mode: "in_person",
    venueCode: "JER",
    attendeeIds: attendees,
    isStrategic: false,
    minutesRecordStrategicDecisions: true,
    minutesAndRecordsKeptInJurisdiction: true,
    ...over,
  };
}

const cite = (docId: string) => ({ docId, page: 1 });

/** Hotel stay covering the whole meeting window, with margin either side. */
export function stay(directorId: string, placeCode: string, from = "2026-03-11T15:00:00Z", to = "2026-03-13T09:00:00Z"): Fact {
  return { kind: "hotel_stay", directorId, placeCode, checkInUtc: from, checkOutUtc: to, cite: cite(`folio_${directorId}_${placeCode}.pdf`) };
}

export function flight(directorId: string, origin: string, dest: string, departUtc: string, arriveUtc: string): Fact {
  return { kind: "flight_leg", directorId, originCode: origin, destCode: dest, departUtc, arriveUtc, cite: cite(`BP_${directorId}_${origin}-${dest}.png`) };
}

export function claim(directorId: string, placeCode: string, source: "minutes" | "recording" | "email" = "minutes"): Fact {
  return { kind: "claimed_location", directorId, placeCode, source, cite: cite(`minutes_2026-03-12.pdf`) };
}

const AIRPORT: Record<string, string> = { "CITY:STHELIER": "JER", "CITY:SINGAPORE": "SIN", "CITY:DUBAI": "DXB", "CITY:LONDON": "LHR" };

/** Evidence that places a director somewhere: the hotel stay plus the flight that landed there the day before.
 *  (A hotel stay on its own only supports presence; see the presence tests.) */
export function there(directorId: string, placeCode: string): Fact[] {
  const dest = AIRPORT[placeCode] ?? placeCode;
  const origin = dest === "LHR" ? "CDG" : "LHR";
  return [stay(directorId, placeCode), flight(directorId, origin, dest, "2026-03-11T08:00:00Z", "2026-03-11T14:00:00Z")];
}

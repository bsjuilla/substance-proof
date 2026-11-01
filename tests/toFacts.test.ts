import { describe, expect, it } from "vitest";
import { localToUtc, matchDirector, normalizePlace, toFacts, zoneOrPlace } from "../src/extract/toFacts";
import { dir } from "./helpers";

describe("time zone conversion (deterministic)", () => {
  it("Dubai 14:30 GST is 10:30Z", () => expect(localToUtc("2026-03-12T14:30", "GST")).toBe("2026-03-12T10:30:00Z"));
  it("Singapore 23:50 SGT is 15:50Z the same day", () => expect(localToUtc("2026-05-18T23:50", "SGT")).toBe("2026-05-18T15:50:00Z"));
  it("Singapore 10:00 SGT is 02:00Z", () => expect(localToUtc("2026-05-19T10:00", "SGT")).toBe("2026-05-19T02:00:00Z"));
  it("midnight crossing: 00:20 SGT is 16:20Z the previous day", () => expect(localToUtc("2026-05-19T00:20", "SGT")).toBe("2026-05-18T16:20:00Z"));
  it("numeric offsets work: GMT+8, UTC+04:00, UTC-05:30, +0530", () => {
    expect(localToUtc("2026-05-19T10:00", "GMT+8")).toBe("2026-05-19T02:00:00Z");
    expect(localToUtc("2026-03-12T14:30", "UTC+04:00")).toBe("2026-03-12T10:30:00Z");
    expect(localToUtc("2026-03-12T10:00", "UTC-05:30")).toBe("2026-03-12T15:30:00Z");
    expect(localToUtc("2026-03-12T10:00", "+0530")).toBe("2026-03-12T04:30:00Z");
  });
  it("an impossible offset is rejected", () => expect(localToUtc("2026-03-12T10:00", "GMT+25")).toBeNull());
  it("an unknown zone label is rejected, not guessed", () => expect(localToUtc("2026-03-12T14:30", "XYZ")).toBeNull());
  it("a missing zone is rejected", () => expect(localToUtc("2026-03-12T14:30", null)).toBeNull());
});

describe("physical sanity checks", () => {
  const roster = [dir("A", { name: "Ana Sokolova" })];
  const base = {
    person_name: "Ana Sokolova", origin_code: "JER", dest_code: "HKG", depart_local: null, depart_tz: null, arrive_local: null, arrive_tz: null,
    place: null, check_in_local: null, check_in_tz: null, check_out_local: null, check_out_tz: null, quote: "x", page: 1,
  };
  const ext = (fact: object) => ({ document_type: "boarding_pass" as const, meeting: { start_local: null, end_local: null, tz: null, place_text: null }, facts: [{ ...base, ...fact } as any] });

  it("rejects a flight that lands before it leaves (AM/PM misread)", () => {
    const r = toFacts([{ docId: "bp.png", extraction: ext({ kind: "flight_leg", depart_local: "2026-06-01T09:57", depart_tz: "GMT", arrive_local: "2026-05-31T16:52", arrive_tz: "GMT" }) }], roster);
    expect(r.facts).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/impossible/);
  });
  it("accepts a normal overnight flight", () => {
    const r = toFacts([{ docId: "bp.png", extraction: ext({ kind: "flight_leg", depart_local: "2026-06-01T21:10", depart_tz: "BST", arrive_local: "2026-06-02T16:05", arrive_tz: "HKT" }) }], roster);
    expect(r.facts).toHaveLength(1);
  });
});

describe("evidence cannot be smuggled in through the minutes or the recording", () => {
  const roster = [dir("B", { name: "Bruno Castell" })];
  const nul = { origin_code: null, dest_code: null, depart_local: null, depart_tz: null, arrive_local: null, arrive_tz: null, place: null, check_in_local: null, check_in_tz: null, check_out_local: null, check_out_tz: null };
  const hotel = { ...nul, kind: "hotel_stay", person_name: "Bruno Castell", place: "St Helier, Jersey", check_in_local: "2026-03-11T18:00", check_in_tz: "GMT", check_out_local: "2026-03-13T10:00", check_out_tz: "GMT", quote: "stayed at the Pomme d'Or", page: 1 };
  const flight = { ...nul, kind: "flight_leg", person_name: "Bruno Castell", origin_code: "DXB", dest_code: "JER", depart_local: "2026-03-10T22:00", depart_tz: "GST", arrive_local: "2026-03-11T06:30", arrive_tz: "GMT", quote: "flew DXB to JER", page: 1 };
  const claim = { ...nul, kind: "claimed_location", person_name: "Bruno Castell", place: "St Helier", quote: "present in St Helier", page: 1 };
  const ext = (document_type: string, facts: object[]) => ({ document_type, meeting: { start_local: null, end_local: null, tz: null, place_text: null }, facts }) as any;

  it("a hotel stay or flight read from the minutes is refused (the minutes are the claim, not the evidence)", () => {
    const r = toFacts([{ docId: "minutes.pdf", extraction: ext("minutes", [claim, hotel, flight]) }], roster);
    expect(r.facts.map((f) => f.kind)).toEqual(["claimed_location"]);
    expect(r.rejected.filter((x) => /cannot come from a minutes/.test(x.reason))).toHaveLength(2);
  });
  it("a hotel stay said aloud in the recording is refused", () => {
    const r = toFacts([{ docId: "rec.wav", extraction: ext("other", [hotel]), turnStartsMs: [0] }], roster);
    expect(r.facts).toHaveLength(0);
  });
  it("a document typed as a hotel folio cannot add a minutes-style claim", () => {
    const r = toFacts([{ docId: "folio.pdf", extraction: ext("hotel_folio", [hotel, claim]) }], roster);
    expect(r.facts.map((f) => f.kind)).toEqual(["hotel_stay"]);
  });
  it("e-tickets typed 'other' still give flights, as in the evaluation runs", () => {
    const r = toFacts([{ docId: "eticket.pdf", extraction: ext("other", [flight]) }], roster);
    expect(r.facts.map((f) => f.kind)).toEqual(["flight_leg"]);
  });
});

describe("zone names and 'local time'", () => {
  it("IANA zone names are resolved for that date (Jersey is BST in July)", () => {
    expect(localToUtc("2026-07-15T10:00", "Europe/Jersey")).toBe("2026-07-15T09:00:00Z");
    expect(localToUtc("2026-01-15T10:00", "Europe/Jersey")).toBe("2026-01-15T10:00:00Z");
    expect(localToUtc("2026-03-12T14:30", "Asia/Dubai")).toBe("2026-03-12T10:30:00Z");
  });
  it("handles the summer-time changeover (Jersey clocks go forward on 29 March 2026)", () => {
    expect(localToUtc("2026-03-28T10:00", "Europe/Jersey")).toBe("2026-03-28T10:00:00Z");
    expect(localToUtc("2026-03-30T10:00", "Europe/Jersey")).toBe("2026-03-30T09:00:00Z");
  });
  it("a bogus zone name is rejected", () => expect(localToUtc("2026-03-12T14:30", "Mars/Olympus")).toBeNull());
  it("'local time' falls back to the zone of the named place, and only then", () => {
    expect(zoneOrPlace("local", "at the registered office, St Helier, Jersey")).toBe("Europe/Jersey");
    expect(zoneOrPlace("local time", "By video conference")).toBeNull();
    expect(zoneOrPlace("GST", "St Helier")).toBe("GST"); // a printed zone always wins
  });
});

describe("place and name matching", () => {
  it("speech-recognition spelling slips match only when clearly closest", () => {
    const roster = [dir("A", { name: "Alice Marlowe" }), dir("B", { name: "Bruno Castell" }), dir("C", { name: "Chandra Velloso" })];
    expect(matchDirector("Bruno Castel", roster, { fuzzy: "speech" })?.id).toBe("B");
    expect(matchDirector("Chandra Velaso", roster, { fuzzy: "speech" })?.id).toBe("C");
    expect(matchDirector("Brian Cassidy", roster, { fuzzy: "speech" })).toBeUndefined();
  });
  it("refuses an ambiguous near-match between two similar names", () => {
    const roster = [dir("A", { name: "Ann Smith" }), dir("B", { name: "Ann Smyth" })];
    expect(matchDirector("Ann Smoth", roster, { fuzzy: "speech" })).toBeUndefined();
  });

  it("airline-style names and hyphenated names", () => {
    const roster = [dir("A", { name: "Priya Anand-Lowe" }), dir("B", { name: "Bruno Castell" })];
    expect(matchDirector("CASTELL/BRUNO", roster)?.id).toBe("B");
    expect(matchDirector("ANAND-LOWE/PRIYA MS", roster)?.id).toBe("A");
    expect(matchDirector("Mr Bruno Castell", roster)?.id).toBe("B");
  });

  it("handles accents and French place names", () => {
    expect(normalizePlace("Dubaï, Émirats arabes unis")).toBe("CITY:DUBAI");
    expect(normalizePlace("Saint-Hélier, Jersey")).toBe("CITY:STHELIER");
    expect(normalizePlace("SINGAPOUR")).toBe("CITY:SINGAPORE");
    expect(normalizePlace("Londres, Royaume-Uni")).toBe("CITY:LONDON");
  });

  it("recognises the places used in the demo", () => {
    expect(normalizePlace("St Helier, Jersey")).toBe("CITY:STHELIER");
    expect(normalizePlace("ST HELIER, JERSEY")).toBe("CITY:STHELIER");
    expect(normalizePlace("Dubai, UAE")).toBe("CITY:DUBAI");
    expect(normalizePlace("JER")).toBe("JER");
    expect(normalizePlace("Atlantis")).toBeNull();
  });

  it("matches names regardless of case and punctuation", () => {
    const roster = [dir("A", { name: "Alice Marlowe" }), dir("B", { name: "Bruno Castell" })];
    expect(matchDirector("BRUNO CASTELL", roster)?.id).toBe("B");
    // A surname alone is refused (it could be a spouse or child); see tests/redteam.test.ts S2.
    expect(matchDirector("Marlowe", roster)).toBeUndefined();
    expect(matchDirector("Zed Nobody", roster)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { localToUtc, matchDirector, normalizePlace, zoneOrPlace } from "../src/extract/toFacts";
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

describe("zone names and 'local time'", () => {
  it("IANA zone names are resolved for that date (Jersey is BST in July)", () => {
    expect(localToUtc("2026-07-15T10:00", "Europe/Jersey")).toBe("2026-07-15T09:00:00Z");
    expect(localToUtc("2026-01-15T10:00", "Europe/Jersey")).toBe("2026-01-15T10:00:00Z");
    expect(localToUtc("2026-03-12T14:30", "Asia/Dubai")).toBe("2026-03-12T10:30:00Z");
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
    expect(matchDirector("Bruno Castel", roster)?.id).toBe("B");
    expect(matchDirector("Chandra Velaso", roster)?.id).toBe("C");
    expect(matchDirector("Brian Cassidy", roster)).toBeUndefined();
  });
  it("refuses an ambiguous near-match between two similar names", () => {
    const roster = [dir("A", { name: "Ann Smith" }), dir("B", { name: "Ann Smyth" })];
    expect(matchDirector("Ann Smoth", roster)).toBeUndefined();
  });

  it("airline-style names and hyphenated names", () => {
    const roster = [dir("A", { name: "Priya Anand-Lowe" }), dir("B", { name: "Bruno Castell" })];
    expect(matchDirector("CASTELL/BRUNO", roster)?.id).toBe("B");
    expect(matchDirector("ANAND-LOWE/PRIYA MS", roster)?.id).toBe("A");
    expect(matchDirector("Mr Bruno Castell", roster)?.id).toBe("B");
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
    expect(matchDirector("Marlowe", roster)?.id).toBe("A");
    expect(matchDirector("Zed Nobody", roster)).toBeUndefined();
  });
});

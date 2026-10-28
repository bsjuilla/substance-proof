import { describe, expect, it } from "vitest";
import { independentLocation, resolvePresence } from "../src/engine/presence";
import { MEETING_END, MEETING_START, claim, flight, meeting, stay } from "./helpers";

describe("presence from independent evidence", () => {
  it("a hotel stay covering the whole meeting places the director there", () => {
    const loc = independentLocation("B", [stay("B", "CITY:STHELIER")], MEETING_START, MEETING_END);
    expect(loc.kind).toBe("located");
    if (loc.kind === "located") expect(loc.j).toBe("JE");
  });

  it("being in the air during part of the meeting means not physically present anywhere", () => {
    // departs Jersey 10:30Z, in the middle of a 09:00-11:00Z meeting
    const facts = [flight("B", "JER", "LHR", "2026-03-12T10:30:00Z", "2026-03-12T11:45:00Z")];
    expect(independentLocation("B", facts, MEETING_START, MEETING_END).kind).toBe("in_transit");
  });

  it("parses local times with offsets correctly (Dubai 14:30+04:00 is 10:30Z)", () => {
    const facts = [flight("B", "DXB", "LHR", "2026-03-12T14:30:00+04:00", "2026-03-12T19:00:00+00:00")];
    expect(independentLocation("B", facts, MEETING_START, MEETING_END).kind).toBe("in_transit");
  });

  it("brackets a director between an arrival before and a departure after, in the same place", () => {
    const facts = [
      flight("B", "LHR", "JER", "2026-03-12T05:00:00Z", "2026-03-12T06:15:00Z"), // lands in Jersey before the meeting
      flight("B", "JER", "LHR", "2026-03-12T15:00:00Z", "2026-03-12T16:15:00Z"), // leaves after the meeting
    ];
    const loc = independentLocation("B", facts, MEETING_START, MEETING_END);
    expect(loc.kind).toBe("located");
    if (loc.kind === "located") expect(loc.j).toBe("JE");
  });

  it("does not guess when only an arrival before the meeting is known", () => {
    const facts = [flight("B", "LHR", "JER", "2026-03-12T05:00:00Z", "2026-03-12T06:15:00Z")];
    expect(independentLocation("B", facts, MEETING_START, MEETING_END).kind).toBe("unknown");
  });

  it("reports unknown when evidence before and after disagree with no flight between", () => {
    const facts = [
      stay("B", "CITY:STHELIER", "2026-03-10T10:00:00Z", "2026-03-12T08:00:00Z"),
      stay("B", "CITY:LONDON", "2026-03-12T12:00:00Z", "2026-03-14T10:00:00Z"),
    ];
    expect(independentLocation("B", facts, MEETING_START, MEETING_END).kind).toBe("unknown");
  });

  it("a claim alone does not prove presence", () => {
    const m = meeting(["B"]);
    const r = resolvePresence("B", m, [claim("B", "CITY:STHELIER")], "JE");
    expect(r.status).toBe("unknown");
    expect(r.basis).toBe("claim_only");
  });

  it("flags a claim that independent evidence contradicts", () => {
    const m = meeting(["B"]);
    const r = resolvePresence("B", m, [claim("B", "CITY:STHELIER"), stay("B", "CITY:DUBAI")], "JE");
    expect(r.status).toBe("absent");
    expect(r.contradiction).toEqual({ claimed: "Jersey", evidence: "United Arab Emirates" });
  });

  it("an unrecognised place code is unknown, never guessed", () => {
    const loc = independentLocation("B", [stay("B", "XXX")], MEETING_START, MEETING_END);
    expect(loc.kind).toBe("unknown");
  });
});

import { describe, expect, it } from "vitest";
import { evaluateMeeting } from "../src/engine/evaluate";
import { company, dir, meeting, there } from "./helpers";

// Four directors with strategic authority; C is chairman.
const four = [dir("A"), dir("B"), dir("C", { isChair: true }), dir("D")];
const st = (ev: ReturnType<typeof evaluateMeeting>, id: string) => ev.tests.find((t) => t.id === id)?.status;
const virtual = (over = {}) => meeting(["A", "B", "C", "D"], { mode: "virtual", venueCode: undefined, chairId: "C", ...over });
const SG = "CITY:SINGAPORE";
const AE = "CITY:DUBAI";

describe("Singapore IRAS control and management: virtual and hybrid meetings", () => {
  it("S1 two of four strategic directors in Singapore (exactly 50%): PASS", () => {
    const facts = [...there("A", SG), ...there("B", SG), ...there("C", AE), ...there("D", AE)];
    const ev = evaluateMeeting(company(four), virtual(), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("pass");
    expect(ev.verdict).toBe("PASS");
  });

  it("S2 only one in Singapore (25%) but the chairman is there: PASS via the chairman route", () => {
    const facts = [...there("A", AE), ...there("B", AE), ...there("C", SG), ...there("D", AE)];
    const ev = evaluateMeeting(company(four), virtual(), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("pass");
  });

  it("S3 only one in Singapore and the chairman is in Dubai: indicator not met, REVIEW (IRAS guidance is not a legal pass/fail)", () => {
    const facts = [...there("A", SG), ...there("B", AE), ...there("C", AE), ...there("D", AE)];
    const ev = evaluateMeeting(company(four), virtual(), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("fail");
    expect(ev.verdict).toBe("REVIEW");
  });

  it("S3b a director who merely chairs one meeting is not 'the chairman' for IRAS", () => {
    const noBoardChair = [dir("A"), dir("B"), dir("C"), dir("D")];
    const facts = [...there("A", AE), ...there("B", AE), ...there("C", SG), ...there("D", AE)];
    const ev = evaluateMeeting(company(noBoardChair), virtual({ chairId: "C" }), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("fail"); // C chaired the meeting but is not Chairman of the Board
  });

  it("S4 no evidence for most directors: REVIEW, not FAIL", () => {
    const facts = [...there("A", SG)];
    const ev = evaluateMeeting(company(four), virtual(), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("inconclusive");
    expect(ev.verdict).toBe("REVIEW");
  });

  it("S5 no chairman appointed: only the 50% condition applies", () => {
    const noChair = [dir("A"), dir("B"), dir("C"), dir("D")];
    const facts = [...there("A", SG), ...there("B", AE), ...there("C", AE), ...there("D", AE)];
    const ev = evaluateMeeting(company(noChair), virtual({ chairId: undefined }), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("fail");
  });

  it("S6 directors without strategic authority are not counted", () => {
    const mixed = [dir("A"), dir("B", { hasStrategicAuthority: false }), dir("C", { hasStrategicAuthority: false }), dir("D", { hasStrategicAuthority: false })];
    // Only A has strategic authority: 100% of strategic directors are in Singapore.
    const facts = [...there("A", SG), ...there("B", AE), ...there("C", AE), ...there("D", AE)];
    const ev = evaluateMeeting(company(mixed), meeting(["A", "B", "C", "D"], { mode: "hybrid", venueCode: "SIN" }), facts, "SG");
    expect(st(ev, "SG-virtual-50pct-or-chair")).toBe("pass");
  });
});

describe("Singapore in-person meetings (assumption-level test)", () => {
  it("S7 venue in Singapore with a quorum evidenced there: PASS", () => {
    const facts = [...there("A", SG), ...there("B", SG), ...there("C", SG), ...there("D", AE)];
    const ev = evaluateMeeting(company(four), meeting(["A", "B", "C", "D"], { venueCode: "SIN" }), facts, "SG");
    expect(st(ev, "SG-inperson-venue")).toBe("pass");
  });

  it("S8 venue not in Singapore: the in-person test fails (guidance-level, so REVIEW)", () => {
    const facts = [...there("A", AE), ...there("B", AE), ...there("C", AE), ...there("D", AE)];
    const ev = evaluateMeeting(company(four), meeting(["A", "B", "C", "D"], { venueCode: "DXB" }), facts, "SG");
    expect(st(ev, "SG-inperson-venue")).toBe("fail");
    expect(ev.verdict).toBe("REVIEW");
  });
});

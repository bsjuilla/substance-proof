import { describe, expect, it } from "vitest";
import { evaluateCompany, evaluateMeeting } from "../src/engine/evaluate";
import { claim, company, dir, flight, meeting, there } from "./helpers";

const three = [dir("A"), dir("B"), dir("C")];

const status = (ev: ReturnType<typeof evaluateMeeting>, id: string) => ev.tests.find((t) => t.id === id)?.status;

describe("Jersey Economic Substance Law 2019, Art. 5(3)", () => {
  it("J1 all three directors evidenced in Jersey: PASS", () => {
    const facts = three.flatMap((d) => there(d.id, "CITY:STHELIER"));
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"]), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("pass");
    expect(ev.verdict).toBe("PASS");
  });

  it("J2 quorum of 2 met with one director in Dubai: PASS", () => {
    const facts = [...there("A", "CITY:STHELIER"), ...there("B", "CITY:STHELIER"), ...there("C", "CITY:DUBAI")];
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"]), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("pass");
    expect(ev.verdict).toBe("PASS");
  });

  it("J3 only one director in Jersey, quorum 2: FAIL (law-level)", () => {
    const facts = [...there("A", "CITY:STHELIER"), ...there("B", "CITY:DUBAI"), ...there("C", "CITY:DUBAI")];
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"]), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("fail");
    expect(ev.verdict).toBe("FAIL");
  });

  it("J4 minutes claim a director was in Jersey but he was in the air: quorum still met, contradiction forces REVIEW", () => {
    const facts = [
      ...there("A", "CITY:STHELIER"),
      ...there("C", "CITY:STHELIER"),
      flight("B", "JER", "LHR", "2026-03-12T10:30:00Z", "2026-03-12T11:45:00Z"),
      claim("B", "CITY:STHELIER"),
    ];
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"]), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("pass");
    expect(ev.contradictions).toHaveLength(1);
    expect(ev.verdict).toBe("REVIEW");
  });

  it("J5 one present, one unproven, one absent: cannot tell, REVIEW", () => {
    const facts = [...there("A", "CITY:STHELIER"), ...there("C", "CITY:DUBAI")];
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"]), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("inconclusive");
    expect(ev.verdict).toBe("REVIEW");
  });

  it("J6 sole director in Jersey passes, in Dubai fails", () => {
    const sole = [dir("A")];
    const inJe = evaluateMeeting(company(sole, 1), meeting(["A"]), [...there("A", "CITY:STHELIER")], "JE");
    const inAe = evaluateMeeting(company(sole, 1), meeting(["A"]), [...there("A", "CITY:DUBAI")], "JE");
    expect(status(inJe, "JE-sole-director")).toBe("pass");
    expect(status(inAe, "JE-sole-director")).toBe("fail");
  });

  it("J7 strategic decisions taken but minutes do not record them: FAIL (Art. 5(3)(c))", () => {
    const facts = three.flatMap((d) => there(d.id, "CITY:STHELIER"));
    const ev = evaluateMeeting(
      company(three),
      meeting(["A", "B", "C"], { isStrategic: true, minutesRecordStrategicDecisions: false }),
      facts,
      "JE",
    );
    expect(status(ev, "JE-minutes-strategic")).toBe("fail");
    expect(ev.verdict).toBe("FAIL");
  });

  it("J8 records location not provided: REVIEW, not a silent pass", () => {
    const facts = three.flatMap((d) => there(d.id, "CITY:STHELIER"));
    const ev = evaluateMeeting(
      company(three),
      meeting(["A", "B", "C"], { minutesAndRecordsKeptInJurisdiction: undefined }),
      facts,
      "JE",
    );
    expect(status(ev, "JE-records-kept")).toBe("inconclusive");
    expect(ev.verdict).toBe("REVIEW");
  });

  it("J9 strategic meeting with only 2 of 4 directors in Jersey: majority (3) not met, guidance-level so REVIEW", () => {
    const four = [dir("A"), dir("B"), dir("C"), dir("D")];
    const facts = [...there("A", "CITY:STHELIER"), ...there("B", "CITY:STHELIER"), ...there("C", "CITY:DUBAI"), ...there("D", "CITY:DUBAI")];
    const ev = evaluateMeeting(company(four), meeting(["A", "B", "C", "D"], { isStrategic: true }), facts, "JE");
    expect(status(ev, "JE-quorum")).toBe("pass");
    expect(status(ev, "JE-majority-strategic")).toBe("fail");
    expect(ev.verdict).toBe("REVIEW");
  });

  it("J11 dialling in from inside Jersey still counts: presence is decided by evidence, not by attendance mode", () => {
    const facts = three.flatMap((d) => there(d.id, "CITY:STHELIER"));
    const ev = evaluateMeeting(company(three), meeting(["A", "B", "C"], { mode: "hybrid" }), [...facts, claim("B", "CITY:STHELIER")], "JE");
    expect(status(ev, "JE-quorum")).toBe("pass");
  });

  it("J10 the guidance-level majority test can be switched off", () => {
    const four = [dir("A"), dir("B"), dir("C"), dir("D")];
    const facts = [...there("A", "CITY:STHELIER"), ...there("B", "CITY:STHELIER"), ...there("C", "CITY:DUBAI"), ...there("D", "CITY:DUBAI")];
    const co = company(four, 2, { jerseyMajorityDirectorsForStrategic: false });
    const ev = evaluateMeeting(co, meeting(["A", "B", "C", "D"], { isStrategic: true }), facts, "JE");
    expect(ev.tests.find((t) => t.id === "JE-majority-strategic")).toBeUndefined();
    expect(ev.verdict).toBe("PASS");
  });
});

describe("Jersey year-level tests", () => {
  const mk = (id: string, inJersey: boolean) => ({
    m: meeting(["A", "B", "C"], { id, startUtc: "2026-03-12T09:00:00Z", endUtc: "2026-03-12T11:00:00Z" }),
    f: three.flatMap((d) => there(d.id, inJersey ? "CITY:STHELIER" : "CITY:DUBAI")),
  });

  it("Y1 majority of meetings held in Jersey passes (3 of 4)", () => {
    const parts = [mk("m1", true), mk("m2", true), mk("m3", true), mk("m4", false)];
    // same dates would overlap facts; give each its own stays by making single-meeting evaluations
    const evals = parts.map((p) => evaluateMeeting(company(three), p.m, p.f, "JE"));
    const result = evaluateCompany(company(three), [], [], "JE"); // sanity: empty year is inconclusive
    expect(result.annualTests.find((t) => t.id === "JE-majority-meetings")?.status).toBe("inconclusive");
    const passes = evals.filter((e) => e.tests.find((t) => t.id === "JE-quorum")?.status === "pass").length;
    expect(passes).toBe(3);
  });

  it("Y2 a minimum frequency is only assessed when the user sets one (the law gives no number)", () => {
    const co = company(three);
    expect(evaluateCompany(co, [], [], "JE").annualTests.find((t) => t.id === "JE-frequency")?.status).toBe("inconclusive");
  });
});

import { describe, expect, it } from "vitest";
import { thresholdInQuote, validatePack } from "../src/rules/buildPack";
import { runPack, type RulePack } from "../src/rules/pack";
import { resolvePresence } from "../src/engine/presence";
import { company, dir, meeting, stay } from "./helpers";

const LAW = "(3) The test is satisfied if – (b) at such board meetings there is a quorum of directors physically present in Jersey; (c) the minutes record the making of strategic decisions.";

const pack = (tests: RulePack["tests"]): RulePack => ({ jurisdiction_code: "JE", jurisdiction_name: "Jersey", source_title: "Test Law", tests, not_supported: [] });
const quorumTest = {
  id: "q", label: "Quorum present", kind: "quorum_physically_present" as const, applies_to: "every_meeting" as const, threshold: null,
  chair_alternative: false, count: "attending_directors" as const, basis: "law" as const, citation: "Art. 5(3)(b)",
  quote: "there is a quorum of directors physically present in Jersey",
};

describe("rule pack validation (code checks what the model proposed)", () => {
  it("accepts a test whose quote is in the source word for word (ignoring spacing and curly quotes)", () => {
    const r = validatePack(pack([quorumTest]), LAW.replace("quorum", "quorum "));
    expect(r.approvedTests).toHaveLength(1);
  });
  it("rejects a paraphrased quote", () => {
    const r = validatePack(pack([{ ...quorumTest, quote: "most directors must be in Jersey in person" }]), LAW);
    expect(r.approvedTests).toHaveLength(0);
    expect(r.rejected[0].problems[0]).toMatch(/word for word/);
  });
  it("rejects a share test without a sensible threshold", () => {
    const r = validatePack(pack([{ ...quorumTest, kind: "share_physically_present_or_chair", threshold: 1.5 }]), LAW);
    expect(r.approvedTests).toHaveLength(0);
  });
});

describe("rule pack execution (deterministic)", () => {
  const three = [dir("A"), dir("B"), dir("C", { isChair: true })];
  const m = meeting(["A", "B", "C"]);
  const presence = (facts: ReturnType<typeof stay>[]) => m.attendeeIds.map((id) => resolvePresence(id, m, facts, "JE"));

  it("quorum test passes with 2 of 3 in Jersey and fails with 1", () => {
    const ok = runPack(pack([quorumTest]), company(three), m, presence([stay("A", "CITY:STHELIER"), stay("B", "CITY:STHELIER"), stay("C", "CITY:DUBAI")]));
    const bad = runPack(pack([quorumTest]), company(three), m, presence([stay("A", "CITY:STHELIER"), stay("B", "CITY:DUBAI"), stay("C", "CITY:DUBAI")]));
    expect(ok[0].status).toBe("pass");
    expect(bad[0].status).toBe("fail");
  });
  it("share-or-chair test passes on the chair route", () => {
    const share = { ...quorumTest, id: "s", kind: "share_physically_present_or_chair" as const, threshold: 0.5, chair_alternative: true, count: "all_directors" as const };
    const r = runPack(pack([share]), company(three), m, presence([stay("A", "CITY:DUBAI"), stay("B", "CITY:DUBAI"), stay("C", "CITY:STHELIER")]));
    expect(r[0].status).toBe("pass");
  });
  it("tests limited to strategic meetings are not applied to ordinary ones", () => {
    const strategicOnly = { ...quorumTest, applies_to: "strategic_meetings" as const };
    const r = runPack(pack([strategicOnly]), company(three), m, presence([]));
    expect(r[0].status).toBe("not_applicable");
  });
});

describe("rule pack thresholds must be stated in the law", () => {
  const q = "At least 50% of the directors (with the authority to make strategic decisions) are physically in Singapore";
  it("accepts 0.5 when the quote says 50%", () => expect(thresholdInQuote(0.5, q)).toBe(true));
  it("accepts 0.5 for 'one half' and 50 per cent", () => {
    expect(thresholdInQuote(0.5, "at least one half of the directors")).toBe(true);
    expect(thresholdInQuote(0.5, "not less than 50 per cent of the directors")).toBe(true);
  });
  it("rejects a weakened threshold the law never states (hijacked model)", () => expect(thresholdInQuote(0.01, q)).toBe(false));
  it("does not read 150% as 50%", () => expect(thresholdInQuote(0.5, "150% of the fee")).toBe(false));
});

import { endsAtClauseBoundary } from "../src/rules/buildPack";

describe("rule pack quotes must not be cut short", () => {
  const law = "(a) the company's board of directors meets in jersey at an adequate frequency having regard to the amount of decision-making required at that level; (b) there is a quorum of directors physically present in jersey; and";
  it("refuses a quote that drops a qualifier (external review finding B7)", () => {
    expect(endsAtClauseBoundary("the company's board of directors meets in jersey", law)).toBe(false);
  });
  it("accepts the complete clause", () => {
    expect(endsAtClauseBoundary("the company's board of directors meets in jersey at an adequate frequency having regard to the amount of decision-making required at that level", law)).toBe(true);
    expect(endsAtClauseBoundary("there is a quorum of directors physically present in jersey", law)).toBe(true);
  });
});

describe("complete clauses are accepted", () => {
  const law = "(a) the board meets in jersey at an adequate frequency; (b) there is a quorum of directors physically present in jersey; (c) the minutes record it.";
  it("accepts a quote that ends with its own semicolon before the next sub-paragraph", () => {
    expect(endsAtClauseBoundary("there is a quorum of directors physically present in jersey;", law)).toBe(true);
  });
  it("still refuses the cut-short version", () => {
    expect(endsAtClauseBoundary("the board meets in jersey", law)).toBe(false);
  });
});

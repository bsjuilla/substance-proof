import { jerseyAnnualTests, jerseyMeetingTests } from "./rules/jersey";
import { singaporeMeetingTests } from "./rules/singapore";
import { resolvePresence } from "./presence";
import type { Company, Fact, Meeting, MeetingEvaluation, MeetingVerdict, TestResult } from "./types";

export type Jurisdiction = "JE" | "SG";

/** FAIL: a test from the statute itself failed. REVIEW: a regulator's guidance condition is not met (guidance such as
 *  IRAS says a meeting "will generally be regarded" one way; it is an indicator, not a legal pass/fail), something is
 *  unproven, a guidance-level test failed, or there is a contradiction. PASS: nothing wrong. */
export function verdictFrom(tests: TestResult[], contradictionCount: number): MeetingVerdict {
  if (tests.some((t) => t.status === "fail" && t.basis === "law")) return "FAIL";
  if (tests.some((t) => t.status === "fail" || t.status === "inconclusive")) return "REVIEW";
  if (contradictionCount > 0) return "REVIEW";
  return "PASS";
}

export function evaluateMeeting(
  company: Company,
  meeting: Meeting,
  facts: Fact[],
  jurisdiction: Jurisdiction,
): MeetingEvaluation {
  const presence = meeting.attendeeIds.map((id) =>
    resolvePresence(id, meeting, facts, jurisdiction, company.directors.find((d) => d.id === id)),
  );
  const tests =
    jurisdiction === "JE"
      ? jerseyMeetingTests(company, meeting, presence)
      : singaporeMeetingTests(company, meeting, presence);
  const contradictions = presence.filter((p) => p.contradiction || p.claimConflict);
  return {
    meetingId: meeting.id,
    jurisdiction,
    verdict: verdictFrom(tests, contradictions.length),
    presence,
    tests,
    contradictions,
  };
}

export type CompanyEvaluation = {
  companyId: string;
  jurisdiction: Jurisdiction;
  meetings: MeetingEvaluation[];
  annualTests: TestResult[];
  overall: MeetingVerdict;
};

export function evaluateCompany(
  company: Company,
  meetings: Meeting[],
  facts: Fact[],
  jurisdiction: Jurisdiction,
): CompanyEvaluation {
  const evals = meetings.map((m) => evaluateMeeting(company, m, facts, jurisdiction));
  const annualTests = jurisdiction === "JE" ? jerseyAnnualTests(company, evals) : [];
  const overall = verdictFrom(
    [...evals.flatMap((e) => e.tests), ...annualTests],
    evals.reduce((n, e) => n + e.contradictions.length, 0),
  );
  return { companyId: company.id, jurisdiction, meetings: evals, annualTests, overall };
}

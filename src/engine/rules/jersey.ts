import type { Company, Meeting, MeetingEvaluation, PresenceResult, TestResult } from "../types";
import { atLeast, countText, tally } from "./helpers";

// Jersey: Taxation (Companies - Economic Substance) (Jersey) Law 2019.
// Law-level tests cite Art. 5(3). Guidance-level tests come from SECONDARY summaries of the
// Comptroller's guidance and are marked basis "guidance" (see docs/SOURCES.md); they can be turned off.

const LAW = "Jersey ES Law 2019";

export function jerseyMeetingTests(company: Company, meeting: Meeting, presence: PresenceResult[]): TestResult[] {
  const out: TestResult[] = [];
  const directorIds = company.directors.map((d) => d.id);
  const attendeeTally = tally(presence, meeting.attendeeIds);
  const opts = company.options ?? {};
  const sole = company.directors.length === 1;

  // Art. 5(3)(b): a quorum of directors physically present in Jersey.
  if (!sole) {
    const status = atLeast(attendeeTally, company.quorumRequired);
    out.push({
      id: "JE-quorum",
      label: "Quorum of directors physically present in Jersey",
      status,
      basis: "law",
      citation: `${LAW}, Art. 5(3)(b)`,
      detail: `Quorum under the articles is ${company.quorumRequired}. Evidence: ${countText(attendeeTally)}.`,
    });
  } else {
    const status = atLeast(attendeeTally, 1);
    out.push({
      id: "JE-sole-director",
      label: "Sole director physically present in Jersey",
      status,
      basis: "guidance",
      citation: `${LAW}, Art. 5(3)(b); sole-director point from Comptroller guidance (secondary summary)`,
      detail: `The company has one director. Evidence: ${countText(attendeeTally)}.`,
    });
  }

  // Art. 5(3)(c): the minutes record the strategic decisions made at the meeting.
  if (meeting.isStrategic) {
    out.push({
      id: "JE-minutes-strategic",
      label: "Minutes record the strategic decisions made",
      status: meeting.minutesRecordStrategicDecisions === undefined ? "inconclusive" : meeting.minutesRecordStrategicDecisions ? "pass" : "fail",
      basis: "law",
      citation: `${LAW}, Art. 5(3)(c)`,
      detail: meeting.minutesRecordStrategicDecisions === undefined
        ? "Nobody has confirmed whether the minutes record the strategic decisions."
        : meeting.minutesRecordStrategicDecisions
          ? "The minutes record the strategic decisions."
          : "Strategic decisions were taken but the minutes do not record them.",
    });
  } else {
    out.push({
      id: "JE-minutes-strategic",
      label: "Minutes record the strategic decisions made",
      status: "not_applicable",
      basis: "law",
      citation: `${LAW}, Art. 5(3)(c)`,
      detail: "No strategic decisions were taken at this meeting.",
    });
  }

  // Art. 5(3)(e): minutes of all board meetings and the company's records are kept in Jersey.
  const kept = meeting.minutesAndRecordsKeptInJurisdiction;
  out.push({
    id: "JE-records-kept",
    label: "Minutes and company records kept in Jersey",
    status: kept === undefined ? "inconclusive" : kept ? "pass" : "fail",
    basis: "law",
    citation: `${LAW}, Art. 5(3)(e)`,
    detail:
      kept === undefined
        ? "No information was provided about where the records are kept."
        : kept
          ? "Records are kept in Jersey."
          : "Records are not kept in Jersey.",
  });

  // Guidance: for strategic meetings, a majority of ALL directors should be physically in Jersey.
  if (!sole && (opts.jerseyMajorityDirectorsForStrategic ?? true)) {
    if (meeting.isStrategic) {
      const all = tally(presence, directorIds);
      const need = Math.floor(directorIds.length / 2) + 1;
      out.push({
        id: "JE-majority-strategic",
        label: "Majority of directors in Jersey for strategic decisions",
        status: atLeast(all, need),
        basis: "guidance",
        citation: "Comptroller guidance as summarised by Jersey law firms (secondary; verify)",
        detail: `A majority of ${directorIds.length} directors is ${need}. Evidence: ${countText(all)}.`,
      });
    } else {
      out.push({
        id: "JE-majority-strategic",
        label: "Majority of directors in Jersey for strategic decisions",
        status: "not_applicable",
        basis: "guidance",
        citation: "Comptroller guidance as summarised by Jersey law firms (secondary; verify)",
        detail: "No strategic decisions were taken at this meeting.",
      });
    }
  }
  return out;
}

/** Year-level tests across all of a company's meetings. `held` = the quorum test passed. */
export function jerseyAnnualTests(
  company: Company,
  evaluations: Pick<MeetingEvaluation, "meetingId" | "tests">[],
): TestResult[] {
  const out: TestResult[] = [];
  const opts = company.options ?? {};
  const total = evaluations.length;
  const quorumResult = (e: Pick<MeetingEvaluation, "tests">) =>
    e.tests.find((t) => t.id === "JE-quorum" || t.id === "JE-sole-director")?.status;
  const passes = evaluations.filter((e) => quorumResult(e) === "pass").length;
  const unknowns = evaluations.filter((e) => quorumResult(e) === "inconclusive").length;

  if (opts.jerseyMajorityOfMeetingsInJersey ?? true) {
    const need = Math.floor(total / 2) + 1;
    const status = passes >= need ? "pass" : passes + unknowns < need ? "fail" : "inconclusive";
    out.push({
      id: "JE-majority-meetings",
      label: "Majority of the year's board meetings held in Jersey",
      status: total === 0 ? "inconclusive" : status,
      basis: "guidance",
      citation: "Comptroller guidance as summarised by Jersey law firms (secondary; verify)",
      detail: `${passes} of ${total} meetings had a quorum evidenced in Jersey; ${unknowns} unproven; ${need} needed.`,
    });
  }

  const min = opts.jerseyMinMeetingsPerYear;
  if (min != null) {
    out.push({
      id: "JE-frequency",
      label: "Board meets in Jersey at an adequate frequency",
      status: passes >= min ? "pass" : passes + unknowns < min ? "fail" : "inconclusive",
      basis: "law",
      citation: `${LAW}, Art. 5(3)(a) ("adequate frequency"; no number in the law)`,
      detail: `Assumption set by the user: at least ${min} meetings a year. ${passes} evidenced in Jersey, ${unknowns} unproven.`,
    });
  } else {
    out.push({
      id: "JE-frequency",
      label: "Board meets in Jersey at an adequate frequency",
      status: "inconclusive",
      basis: "law",
      citation: `${LAW}, Art. 5(3)(a) ("adequate frequency"; no number in the law)`,
      detail: "The law gives no number. Set a minimum number of meetings a year to have this assessed.",
    });
  }
  return out;
}

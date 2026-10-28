import { jurisdictionOf } from "../gazetteer";
import type { Company, Meeting, PresenceResult, TestResult } from "../types";
import { atLeast, countText, strategicDirectors, tally } from "./helpers";

// Singapore: IRAS, "Tax Residency of a Company / Certificate of Residence" (control and management).
// https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/tax-residency-of-a-company

const SRC = "IRAS, Tax Residency of a Company (control and management)";

export function singaporeMeetingTests(company: Company, meeting: Meeting, presence: PresenceResult[]): TestResult[] {
  const strategic = strategicDirectors(company);
  const strategicIds = strategic.map((d) => d.id);
  const t = tally(presence, strategicIds);
  const need = Math.ceil(strategicIds.length / 2); // "at least 50%"

  const chair = meeting.chairId ?? company.directors.find((d) => d.isChair)?.id;
  const chairPresence = chair ? presence.find((p) => p.directorId === chair) : undefined;

  if (meeting.mode === "virtual" || meeting.mode === "hybrid") {
    // IRAS: a meeting involving virtual meeting technology will generally be regarded as having
    // strategic decisions made in Singapore if EITHER condition is met.
    const fiftyStatus = strategicIds.length === 0 ? "inconclusive" : atLeast(t, need);
    let chairStatus: "pass" | "fail" | "inconclusive" | "none" = "none";
    if (chair) {
      chairStatus = chairPresence?.status === "present" ? "pass" : chairPresence?.status === "absent" ? "fail" : "inconclusive";
    }
    let status: TestResult["status"];
    if (fiftyStatus === "pass" || chairStatus === "pass") status = "pass";
    else if (fiftyStatus === "fail" && (chairStatus === "fail" || chairStatus === "none")) status = "fail";
    else status = "inconclusive";

    const chairText =
      chairStatus === "none"
        ? "No chairman is appointed, so only the 50% condition applies."
        : `Chairman physically in Singapore: ${chairStatus === "pass" ? "yes" : chairStatus === "fail" ? "no" : "unproven"}.`;
    return [
      {
        id: "SG-virtual-50pct-or-chair",
        label: "Virtual or hybrid meeting: at least 50% of strategic directors in Singapore, or the chairman",
        status,
        basis: "regulator",
        citation: `${SRC}: virtual meeting technology conditions`,
        detail: `Directors with strategic authority: ${strategicIds.length}; ${need} needed for 50%. Evidence: ${countText(t)}. ${chairText}`,
      },
    ];
  }

  // In-person meeting. IRAS says the usual test is where the board meetings are held; it publishes
  // no numeric test for physical meetings. We assume the venue must be Singapore AND a quorum is
  // evidenced there. This is an ASSUMPTION and is labelled as guidance, not as the regulator's rule.
  const venueJ = meeting.venueCode ? jurisdictionOf(meeting.venueCode) : undefined;
  const attendees = tally(presence, meeting.attendeeIds);
  let status: TestResult["status"];
  if (!venueJ) status = "inconclusive";
  else if (venueJ !== "SG") status = "fail";
  else status = atLeast(attendees, company.quorumRequired);
  return [
    {
      id: "SG-inperson-venue",
      label: "In-person meeting held in Singapore with a quorum physically there",
      status,
      basis: "guidance",
      citation: `${SRC}: location of board meetings (no numeric test published for physical meetings; quorum requirement is our assumption)`,
      detail: `Declared venue: ${meeting.venueCode ?? "not stated"}. Quorum ${company.quorumRequired}. Evidence: ${countText(attendees)}.`,
    },
  ];
}

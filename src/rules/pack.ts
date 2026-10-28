import { z } from "zod";
import { atLeast, countText, tally } from "../engine/rules/helpers";
import type { Company, Meeting, PresenceResult, TestResult } from "../engine/types";
import { jurisdictionOf } from "../engine/gazetteer";

// A RULE PACK is a jurisdiction's presence rules written as data. Muse Spark can draft one from the text of
// a law; code validates it; a person approves it; then this deterministic executor runs it. The model can only
// choose from the test KINDS below, because those are the only ones the engine knows how to compute.

export const TEST_KINDS = [
  "quorum_physically_present",      // at least the articles' quorum of attending directors physically in the jurisdiction
  "majority_physically_present",    // more than half of ALL directors physically in the jurisdiction
  "share_physically_present_or_chair", // at least `threshold` of the counted directors physically there, or (if allowed) the chair
  "venue_in_jurisdiction",          // the meeting's declared venue is in the jurisdiction
  "minutes_record_strategic_decisions",
  "records_kept_in_jurisdiction",
  "sole_director_physically_present",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const APPLIES = ["every_meeting", "strategic_meetings", "virtual_or_hybrid_meetings", "in_person_meetings"] as const;

export const PackTestSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(TEST_KINDS),
  applies_to: z.enum(APPLIES),
  threshold: z.number().nullable(), // only for share_physically_present_or_chair, e.g. 0.5
  chair_alternative: z.boolean(), // only for share_physically_present_or_chair
  count: z.enum(["attending_directors", "all_directors", "directors_with_strategic_authority"]),
  basis: z.enum(["law", "regulator", "guidance"]),
  citation: z.string(), // e.g. "Art. 5(3)(b)"
  quote: z.string(), // VERBATIM text from the source that this test implements
});
export type PackTest = z.infer<typeof PackTestSchema>;

export const RulePackSchema = z.object({
  jurisdiction_code: z.string(), // ISO 3166-1 alpha-2, e.g. "JE"
  jurisdiction_name: z.string(),
  source_title: z.string(),
  tests: z.array(PackTestSchema),
  not_supported: z.array(z.object({ requirement: z.string(), quote: z.string() })), // rules found but not executable
});
export type RulePack = z.infer<typeof RulePackSchema>;

function applies(t: PackTest, m: Meeting): boolean {
  switch (t.applies_to) {
    case "every_meeting": return true;
    case "strategic_meetings": return m.isStrategic;
    case "virtual_or_hybrid_meetings": return m.mode === "virtual" || m.mode === "hybrid";
    case "in_person_meetings": return m.mode === "in_person";
  }
}

/** Runs an (approved) rule pack. Deterministic; no AI. */
export function runPack(pack: RulePack, company: Company, meeting: Meeting, presence: PresenceResult[]): TestResult[] {
  const out: TestResult[] = [];
  const allIds = company.directors.map((d) => d.id);
  const ids = (c: PackTest["count"]) =>
    c === "attending_directors" ? meeting.attendeeIds
      : c === "all_directors" ? allIds
      : company.directors.filter((d) => d.hasStrategicAuthority).map((d) => d.id);
  for (const t of pack.tests) {
    const base = { id: `PACK-${t.id}`, label: t.label, basis: t.basis, citation: `${pack.source_title}, ${t.citation}` } as const;
    if (!applies(t, meeting)) {
      out.push({ ...base, status: "not_applicable", detail: `Applies only to ${t.applies_to.replace(/_/g, " ")}.` });
      continue;
    }
    const sole = company.directors.length === 1;
    switch (t.kind) {
      case "quorum_physically_present": {
        if (sole) { out.push({ ...base, status: "not_applicable", detail: "Sole-director company." }); break; }
        const tl = tally(presence, ids(t.count));
        out.push({ ...base, status: atLeast(tl, company.quorumRequired), detail: `Quorum ${company.quorumRequired}. Evidence: ${countText(tl)}.` });
        break;
      }
      case "majority_physically_present": {
        if (sole) { out.push({ ...base, status: "not_applicable", detail: "Sole-director company." }); break; }
        const group = ids(t.count);
        const tl = tally(presence, group);
        const need = Math.floor(group.length / 2) + 1;
        out.push({ ...base, status: atLeast(tl, need), detail: `Majority of ${group.length} is ${need}. Evidence: ${countText(tl)}.` });
        break;
      }
      case "share_physically_present_or_chair": {
        const group = ids(t.count);
        const share = t.threshold && t.threshold > 0 && t.threshold <= 1 ? t.threshold : 0.5;
        const need = Math.ceil(group.length * share - 1e-9);
        const tl = tally(presence, group);
        const shareStatus = group.length === 0 ? "inconclusive" : atLeast(tl, need);
        const chair = company.directors.find((d) => d.isChair)?.id; // the Chairman of the Board
        const cp = chair ? presence.find((p) => p.directorId === chair)?.status : undefined;
        const chairStatus = !t.chair_alternative || !chair ? "none" : cp === "present" ? "pass" : cp === "absent" ? "fail" : "inconclusive";
        const status = shareStatus === "pass" || chairStatus === "pass" ? "pass"
          : shareStatus === "fail" && (chairStatus === "fail" || chairStatus === "none") ? "fail" : "inconclusive";
        out.push({ ...base, status, detail: `${Math.round(share * 100)}% of ${group.length} counted directors is ${need}. Evidence: ${countText(tl)}.${t.chair_alternative ? ` Chair physically there: ${chairStatus === "pass" ? "yes" : chairStatus === "fail" ? "no" : chairStatus === "none" ? "no chair" : "unproven"}.` : ""}` });
        break;
      }
      case "venue_in_jurisdiction": {
        const vj = meeting.venueCode ? jurisdictionOf(meeting.venueCode) : undefined;
        out.push({ ...base, status: !vj ? "inconclusive" : vj === pack.jurisdiction_code ? "pass" : "fail", detail: `Declared venue: ${meeting.venueCode ?? "not stated"}.` });
        break;
      }
      case "minutes_record_strategic_decisions":
        out.push(meeting.isStrategic
          ? { ...base, status: meeting.minutesRecordStrategicDecisions ? "pass" : "fail", detail: meeting.minutesRecordStrategicDecisions ? "The minutes record the strategic decisions." : "Strategic decisions not recorded." }
          : { ...base, status: "not_applicable", detail: "No strategic decisions were taken." });
        break;
      case "records_kept_in_jurisdiction": {
        const k = meeting.minutesAndRecordsKeptInJurisdiction;
        out.push({ ...base, status: k === undefined ? "inconclusive" : k ? "pass" : "fail", detail: k === undefined ? "Not stated." : k ? "Kept in the jurisdiction." : "Not kept in the jurisdiction." });
        break;
      }
      case "sole_director_physically_present": {
        if (!sole) { out.push({ ...base, status: "not_applicable", detail: "Company has more than one director." }); break; }
        const tl = tally(presence, allIds);
        out.push({ ...base, status: atLeast(tl, 1), detail: `Evidence: ${countText(tl)}.` });
        break;
      }
    }
  }
  return out;
}

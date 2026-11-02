import { describe, expect, it } from "vitest";
import { verdictFrom } from "../src/engine/evaluate";
import { decide } from "../src/extract/pipeline";
import { secondOpinion } from "../src/extract/secondReader";

// The second reader (Muse Glimmer) may only make a result more careful: it can send a meeting to REVIEW when its
// independent reading leads to a different answer, and it can never turn REVIEW or NOT MET into PASS.
// Both directors live in Jersey (reviewed residence records), so a St Helier folio confirms them and a Dubai one
// places them away. (A hotel stay alone would only support presence.)
const roster: any = [
  { id: "A", name: "Bruno Castell", isChair: true, hasStrategicAuthority: true, residentIn: "JE" },
  { id: "B", name: "Chandra Velloso", hasStrategicAuthority: true, residentIn: "JE" },
];
const company: any = { id: "C", name: "X", directors: roster, quorumRequired: 2, options: {} };
const meeting: any = {
  id: "m", startUtc: "2026-06-15T10:00:00Z", endUtc: "2026-06-15T11:00:00Z", mode: "in_person", venueCode: "CITY:STHELIER",
  attendeeIds: ["A", "B"], isStrategic: true, minutesRecordStrategicDecisions: true, minutesAndRecordsKeptInJurisdiction: true,
};
const nul = { origin_code: null, dest_code: null, depart_local: null, depart_tz: null, arrive_local: null, arrive_tz: null, place: null, check_in_local: null, check_in_tz: null, check_out_local: null, check_out_tz: null };
const folio = (person: string, place: string, checkIn = "2026-06-14T15:00") => ({
  document_type: "hotel_folio",
  meeting: { start_local: null, end_local: null, tz: null, place_text: null },
  facts: [{ ...nul, kind: "hotel_stay", person_name: person, place, check_in_local: checkIn, check_in_tz: "BST", check_out_local: "2026-06-16T11:00", check_out_tz: "BST", quote: "q", page: 1 }],
}) as any;

const minutes = {
  document_type: "minutes",
  meeting: { start_local: "2026-06-15T11:00", end_local: "2026-06-15T12:00", tz: "BST", place_text: "St Helier, Jersey" },
  facts: ["Bruno Castell", "Chandra Velloso"].map((person_name) => ({
    kind: "claimed_location", person_name, place: "St Helier", quote: "present in St Helier", page: 1,
    origin_code: null, dest_code: null, depart_local: null, depart_tz: null, arrive_local: null, arrive_tz: null,
    check_in_local: null, check_in_tz: null, check_out_local: null, check_out_tz: null,
  })),
} as any;
const items = [
  { docId: "m/minutes.pdf", extraction: minutes },
  { docId: "m/stay/folio_A.pdf", extraction: folio("Bruno Castell", "St Helier, Jersey") },
  { docId: "m/stay/folio_B.pdf", extraction: folio("Chandra Velloso", "St Helier, Jersey") },
];
const primary = () => {
  const d = decide(items, company, meeting, "JE");
  return { facts: d.facts.facts, evaluation: d.evaluation };
};
const combined = (so: ReturnType<typeof secondOpinion>, p = primary()) =>
  verdictFrom([...p.evaluation.tests, so.test], p.evaluation.contradictions.length);

describe("second reader (Muse Glimmer)", () => {
  it("passes when both readings are the same", () => {
    const so = secondOpinion(items, items, company, meeting, "JE", primary());
    expect(so.test.status).toBe("pass");
    expect(so.agreed).toBe(so.total);
    expect(so.changesDecision).toHaveLength(0);
  });

  it("sends the meeting to REVIEW when the second reading changes a director's presence", () => {
    const p = primary();
    expect(p.evaluation.verdict).toBe("PASS");
    const glimmer = [items[0], items[1], { docId: "m/stay/folio_B.pdf", extraction: folio("Chandra Velloso", "Dubai, UAE") }];
    const so = secondOpinion(items, glimmer, company, meeting, "JE", p);
    expect(so.test.status).toBe("fail");
    expect(so.changesDecision.some((c) => c.what.startsWith("Chandra Velloso"))).toBe(true);
    expect(combined(so, p)).toBe("REVIEW");
  });

  it("reports a differing fact that does not change the answer, without holding the meeting up", () => {
    const glimmer = [items[0], items[1], { docId: "m/stay/folio_B.pdf", extraction: folio("Chandra Velloso", "St Helier, Jersey", "2026-06-13T15:00") }];
    const so = secondOpinion(items, glimmer, company, meeting, "JE", primary());
    expect(so.test.status).toBe("pass");
    expect(so.disagreements.length).toBeGreaterThan(0);
  });

  it("when the second reader fails on every document, the second opinion is missing and a person looks", () => {
    // Live test: NVIDIA answered 404 to every document and the check used to say "not applicable".
    const so = secondOpinion(items, [{ docId: "m/stay/folio_A.pdf", error: "HTTP 404" }], company, meeting, "JE", primary());
    expect(so.test.status).toBe("inconclusive");
    expect(so.unread).toHaveLength(1);
    expect(combined(so)).toBe("REVIEW");
    expect(secondOpinion(items, [], company, meeting, "JE", primary()).test.status).toBe("not_applicable");
  });

  it("cannot turn a failing meeting into a PASS", () => {
    const away = [items[0], items[1], { docId: "m/stay/folio_B.pdf", extraction: folio("Chandra Velloso", "Dubai, UAE") }];
    const d = decide(away, company, meeting, "JE");
    const p = { facts: d.facts.facts, evaluation: d.evaluation };
    expect(p.evaluation.verdict).not.toBe("PASS");
    const so = secondOpinion(away, items, company, meeting, "JE", p); // Glimmer reads St Helier for both
    expect(so.test.status).toBe("fail");
    expect(combined(so, p)).not.toBe("PASS");
  });
});

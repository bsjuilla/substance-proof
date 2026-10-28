import type OpenAI from "openai";
import { costUsd } from "../extract/client";
import { APPLIES, RulePackSchema, TEST_KINDS, type RulePack } from "./pack";

// Muse Spark reads the FULL text of a law or regulator guidance (long context) and drafts a rule pack.
// Code then validates every proposed test: its quote must appear word for word in the source, and its
// parameters must be ones the engine can compute. A person approves the pack before it is used.

const nullableNum = { type: ["number", "null"] } as const;
const PACK_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["jurisdiction_code", "jurisdiction_name", "source_title", "tests", "not_supported"],
  properties: {
    jurisdiction_code: { type: "string" },
    jurisdiction_name: { type: "string" },
    source_title: { type: "string" },
    tests: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "label", "kind", "applies_to", "threshold", "chair_alternative", "count", "basis", "citation", "quote"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          kind: { type: "string", enum: [...TEST_KINDS] },
          applies_to: { type: "string", enum: [...APPLIES] },
          threshold: nullableNum,
          chair_alternative: { type: "boolean" },
          count: { type: "string", enum: ["attending_directors", "all_directors", "directors_with_strategic_authority"] },
          basis: { type: "string", enum: ["law", "regulator", "guidance"] },
          citation: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
    not_supported: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["requirement", "quote"], properties: { requirement: { type: "string" }, quote: { type: "string" } } },
    },
  },
} as const;

const SYSTEM = `You convert the text of a law or official tax guidance into a RULE PACK for a deterministic engine that checks whether a company's BOARD MEETINGS satisfied requirements about WHERE DIRECTORS PHYSICALLY WERE and how meetings were held and recorded.

You may ONLY use these test kinds (the engine cannot compute anything else):
- quorum_physically_present: a quorum of directors is physically present in the jurisdiction at the meeting.
- majority_physically_present: a majority of the directors is physically present in the jurisdiction.
- share_physically_present_or_chair: at least a stated share (threshold, e.g. 0.5 for "at least 50%") of the counted directors is physically present; set chair_alternative=true if the text says the chair being present is an alternative way to satisfy it.
- venue_in_jurisdiction: the meeting is held in the jurisdiction.
- minutes_record_strategic_decisions: the minutes record the strategic decisions made at the meeting.
- records_kept_in_jurisdiction: the minutes and/or company records are kept in the jurisdiction.
- sole_director_physically_present: a sole director is physically present when deciding.

For each test:
- quote: copy, WORD FOR WORD, the shortest sentence or clause of the source that states this requirement. Do not paraphrase. Do not join text from different places.
- citation: the article, paragraph or section reference as it appears in the source (or the heading it sits under).
- applies_to: every_meeting, strategic_meetings, virtual_or_hybrid_meetings or in_person_meetings, exactly as the text limits it.
- count: which directors are counted (attending_directors, all_directors, or directors_with_strategic_authority if the text counts only directors with authority to make strategic decisions).
- basis: "law" for a statute, "regulator" for official tax-authority guidance.
- threshold: only for share_physically_present_or_chair, otherwise null. chair_alternative: false unless stated.

Only encode statements that set a CONDITION or TEST ("is satisfied if", "must", "will generally be regarded as ... if"). Do NOT encode descriptive or hedged statements (for example "usually ...", "factors considered include ...", "may not be sufficient"); put those in not_supported instead.

Requirements in the text that are about where directors are or how meetings are held, but that NONE of the kinds can express (for example "adequate frequency" with no number, "necessary knowledge and expertise", employees, expenditure, premises), go into not_supported with their verbatim quote. Never invent a requirement that is not in the text. Never give legal advice.`;

const norm = (s: string) =>
  s.replace(/&#160;|&nbsp;| /g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

export type ValidatedTest = RulePack["tests"][number] & { quoteFound: boolean; problems: string[] };
export type BuildResult = {
  pack: RulePack;
  validated: ValidatedTest[];
  approvedTests: RulePack["tests"]; // tests that passed every check (still need a human's approval in the UI)
  rejected: { id: string; problems: string[] }[];
  costUsd: number;
  inputTokens: number;
  seconds: number;
};

export function validatePack(pack: RulePack, sourceText: string): Omit<BuildResult, "costUsd" | "inputTokens" | "seconds"> {
  const src = norm(sourceText);
  const validated: ValidatedTest[] = pack.tests.map((t) => {
    const problems: string[] = [];
    const q = norm(t.quote);
    const quoteFound = q.length >= 15 && src.includes(q);
    if (!quoteFound) problems.push("quote not found word for word in the source");
    if (t.kind === "share_physically_present_or_chair" && !(t.threshold && t.threshold > 0 && t.threshold <= 1)) problems.push("share test needs a threshold between 0 and 1");
    if (t.kind !== "share_physically_present_or_chair" && t.threshold !== null) problems.push("threshold only allowed on share tests");
    if (!t.citation.trim()) problems.push("missing citation");
    return { ...t, quoteFound, problems };
  });
  if (!/^[A-Z]{2}$/.test(pack.jurisdiction_code)) validated.forEach((v) => v.problems.push("jurisdiction code must be two capital letters"));
  const approvedTests = validated.filter((v) => v.problems.length === 0).map(({ quoteFound: _q, problems: _p, ...t }) => t);
  return { pack, validated, approvedTests, rejected: validated.filter((v) => v.problems.length).map((v) => ({ id: v.id, problems: v.problems })) };
}

export async function buildPack(client: OpenAI, model: string, sourceTitle: string, sourceText: string): Promise<BuildResult> {
  const t0 = Date.now();
  const r: any = await client.responses.create({
    model,
    max_output_tokens: 12000,
    reasoning: { effort: "medium" },
    text: { format: { type: "json_schema", name: "rule_pack", strict: true, schema: PACK_JSON_SCHEMA as any } },
    input: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Source title: ${sourceTitle}\n\nFULL SOURCE TEXT:\n\n${sourceText}` },
    ],
  });
  const pack = RulePackSchema.parse(JSON.parse(r.output_text));
  return { ...validatePack(pack, sourceText), costUsd: costUsd(r.usage), inputTokens: r.usage?.input_tokens ?? 0, seconds: Math.round((Date.now() - t0) / 1000) };
}

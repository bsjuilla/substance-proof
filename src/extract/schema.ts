import { z } from "zod";

// What the model is asked to return for ONE document. It reports what is PRINTED, in local time
// with the printed zone label. It never converts time zones and never decides anything:
// conversion and all rule logic are done by deterministic code.

const nullableStr = { type: ["string", "null"] } as const;

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_type", "meeting", "facts"],
  properties: {
    document_type: { type: "string", enum: ["minutes", "boarding_pass", "hotel_folio", "other"] },
    meeting: {
      type: "object",
      additionalProperties: false,
      required: ["start_local", "end_local", "tz", "place_text"],
      properties: {
        start_local: nullableStr, // "YYYY-MM-DDTHH:MM" as printed (minutes only)
        end_local: nullableStr,
        tz: nullableStr, // zone label as printed, e.g. "GMT"
        place_text: nullableStr,
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind", "person_name", "origin_code", "dest_code", "depart_local", "depart_tz", "arrive_local", "arrive_tz",
          "place", "check_in_local", "check_in_tz", "check_out_local", "check_out_tz", "quote", "page",
        ],
        properties: {
          kind: { type: "string", enum: ["flight_leg", "hotel_stay", "claimed_location"] },
          person_name: { type: "string" },
          origin_code: nullableStr,
          dest_code: nullableStr,
          depart_local: nullableStr,
          depart_tz: nullableStr,
          arrive_local: nullableStr,
          arrive_tz: nullableStr,
          place: nullableStr,
          check_in_local: nullableStr,
          check_in_tz: nullableStr,
          check_out_local: nullableStr,
          check_out_tz: nullableStr,
          quote: { type: "string" },
          page: { type: "integer" },
        },
      },
    },
  },
} as const;

const ns = z.string().nullable();
export const ExtractionSchema = z.object({
  document_type: z.enum(["minutes", "boarding_pass", "hotel_folio", "other"]),
  meeting: z.object({ start_local: ns, end_local: ns, tz: ns, place_text: ns }),
  facts: z.array(
    z.object({
      kind: z.enum(["flight_leg", "hotel_stay", "claimed_location"]),
      person_name: z.string(),
      origin_code: ns,
      dest_code: ns,
      depart_local: ns,
      depart_tz: ns,
      arrive_local: ns,
      arrive_tz: ns,
      place: ns,
      check_in_local: ns,
      check_in_tz: ns,
      check_out_local: ns,
      check_out_tz: ns,
      quote: z.string(),
      page: z.number().int(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const SYSTEM_PROMPT = `You read ONE document from a company board-meeting pack and report only what is printed on it.
Rules:
- Report times exactly as printed, in LOCAL time, as "YYYY-MM-DDTHH:MM" (24-hour), together with the time zone label printed next to them (for example GMT, GST, SGT). Never convert between time zones. Never guess a zone that is not printed: use null.
- If an arrival time is printed with a different date, use that date; otherwise use the departure date.
- Boarding pass: one flight_leg fact with the airport codes, departure and arrival local times. Put the passenger's name in person_name.
- Hotel folio: one hotel_stay fact: place is the city and country printed, check-in = Arrival, check-out = Departure, with their zone labels. Guest name in person_name.
- Minutes: set meeting.start_local, meeting.end_local, meeting.tz and meeting.place_text from the heading. Then one claimed_location fact per person in the attendance table: place is the place named in their "Attended" text (for example "St Helier" or "Dubai"), quote is that attendance text copied exactly, person_name is the person's name.
- For fields that do not apply to a fact, use null. quote must be copied exactly from the document. page is the 1-based page number.
- Do not decide whether anyone met any legal test. Do not add facts that are not printed.`;

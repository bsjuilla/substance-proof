import type { Citation, Director, Fact } from "../engine/types";
import type { Extraction } from "./schema";

// Deterministic conversion of what the model READ into engine inputs. Nothing here uses AI.

// Zone labels -> minutes east of UTC. Unknown labels are rejected, never guessed.
const TZ_MINUTES: Record<string, number> = {
  UTC: 0, GMT: 0, BST: 60, WET: 0, WEST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180,
  GST: 240, MUT: 240, SGT: 480, HKT: 480, SAST: 120, AST: -240, EST: -300, EDT: -240, PST: -480, PDT: -420,
};

/** Minutes east of UTC for a printed zone label: "GST", "GMT+8", "UTC-05:00", "+0530". Null if unknown. */
export function tzOffsetMinutes(label: string): number | null {
  const t = label.trim().toUpperCase().replace(/\s+/g, "");
  if (t in TZ_MINUTES) return TZ_MINUTES[t];
  const m = t.match(/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const hours = Number(m[2]);
  const mins = m[3] ? Number(m[3]) : 0;
  if (hours > 14 || mins > 59) return null;
  return (m[1] === "-" ? -1 : 1) * (hours * 60 + mins);
}

export function localToUtc(local: string | null, tz: string | null): string | null {
  if (!local || !tz) return null;
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const off = tzOffsetMinutes(tz);
  if (!m || off === null) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const t = Date.UTC(y, mo - 1, d, h, mi) - off * 60_000;
  return new Date(t).toISOString().replace(".000Z", "Z");
}

export function normalizePlace(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bhelier\b|\bjersey\b/.test(t)) return "CITY:STHELIER";
  if (/\bdubai\b/.test(t)) return "CITY:DUBAI";
  if (/\bsingapore\b/.test(t)) return "CITY:SINGAPORE";
  if (/\blondon\b/.test(t)) return "CITY:LONDON";
  if (/^[a-z]{3}$/i.test(text.trim())) return text.trim().toUpperCase();
  return null; // unrecognised: the engine treats it as unknown
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();

export function matchDirector(name: string, roster: Director[]): Director | undefined {
  const n = norm(name);
  const exact = roster.find((d) => norm(d.name) === n);
  if (exact) return exact;
  const last = n.split(" ").pop()!;
  const byLast = roster.filter((d) => norm(d.name).split(" ").pop() === last);
  return byLast.length === 1 ? byLast[0] : undefined;
}

export type ToFactsResult = {
  facts: Fact[];
  meetingWindow?: { startUtc: string; endUtc: string };
  rejected: { file: string; reason: string }[];
};

export function toFacts(items: { docId: string; extraction: Extraction }[], roster: Director[]): ToFactsResult {
  const facts: Fact[] = [];
  const rejected: ToFactsResult["rejected"] = [];
  let meetingWindow: ToFactsResult["meetingWindow"];

  for (const { docId, extraction } of items) {
    if (extraction.document_type === "minutes") {
      const s = localToUtc(extraction.meeting.start_local, extraction.meeting.tz);
      const e = localToUtc(extraction.meeting.end_local, extraction.meeting.tz);
      if (s && e) meetingWindow = { startUtc: s, endUtc: e };
      else rejected.push({ file: docId, reason: "meeting time or zone not readable" });
    }
    for (const f of extraction.facts) {
      const dir = matchDirector(f.person_name, roster);
      if (!dir) {
        rejected.push({ file: docId, reason: `name "${f.person_name}" matches no director` });
        continue;
      }
      const cite: Citation = { docId, page: f.page, quote: f.quote };
      if (f.kind === "flight_leg") {
        const dep = localToUtc(f.depart_local, f.depart_tz);
        const arr = localToUtc(f.arrive_local, f.arrive_tz);
        if (!f.origin_code || !f.dest_code || !dep || !arr) {
          rejected.push({ file: docId, reason: "flight leg incomplete or zone unknown" });
          continue;
        }
        facts.push({ kind: "flight_leg", directorId: dir.id, originCode: f.origin_code.toUpperCase(), destCode: f.dest_code.toUpperCase(), departUtc: dep, arriveUtc: arr, cite });
      } else if (f.kind === "hotel_stay") {
        const place = normalizePlace(f.place);
        const cin = localToUtc(f.check_in_local, f.check_in_tz);
        const cout = localToUtc(f.check_out_local, f.check_out_tz);
        if (!place || !cin || !cout) {
          rejected.push({ file: docId, reason: `hotel stay incomplete, place "${f.place}" or zone unknown` });
          continue;
        }
        facts.push({ kind: "hotel_stay", directorId: dir.id, placeCode: place, checkInUtc: cin, checkOutUtc: cout, cite });
      } else {
        const place = normalizePlace(f.place);
        if (!place) {
          rejected.push({ file: docId, reason: `claimed place "${f.place}" not recognised` });
          continue;
        }
        facts.push({ kind: "claimed_location", directorId: dir.id, placeCode: place, source: "minutes", cite });
      }
    }
  }
  return { facts, meetingWindow, rejected };
}

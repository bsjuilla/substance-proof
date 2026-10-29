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

/** Offset of an IANA zone ("Asia/Dubai") at a given UTC instant, in minutes east of UTC. */
function ianaOffsetAt(zone: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(utcMs));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
    return Math.round((asUtc - utcMs) / 60_000);
  } catch {
    return null; // not a valid IANA zone
  }
}

export function localToUtc(local: string | null, tz: string | null): string | null {
  if (!local || !tz) return null;
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let off = tzOffsetMinutes(tz);
  if (off === null && tz.includes("/")) {
    // IANA name: the offset depends on the date (summer time), so resolve it at that moment.
    const first = ianaOffsetAt(tz.trim(), naive);
    if (first === null) return null;
    off = ianaOffsetAt(tz.trim(), naive - first * 60_000);
  }
  if (off === null) return null;
  return new Date(naive - off * 60_000).toISOString().replace(".000Z", "Z");
}

/** The time zone of a known place, used ONLY when a document prints "local time" without naming a zone. */
export const PLACE_ZONE: Record<string, string> = {
  "CITY:STHELIER": "Europe/Jersey",
  JER: "Europe/Jersey",
  "CITY:SINGAPORE": "Asia/Singapore",
  SIN: "Asia/Singapore",
  "CITY:DUBAI": "Asia/Dubai",
  DXB: "Asia/Dubai",
  "CITY:LONDON": "Europe/London",
  LHR: "Europe/London",
  "CITY:HONGKONG": "Asia/Hong_Kong",
  HKG: "Asia/Hong_Kong",
  "CITY:PARIS": "Europe/Paris",
  CDG: "Europe/Paris",
};

/** A printed zone label, or the place's own zone when the document only says "local time". */
export function zoneOrPlace(tz: string | null, placeText: string | null): string | null {
  const t = tz?.trim();
  if (t && !/^local( time)?$/i.test(t)) return t;
  const code = normalizePlace(placeText);
  return code ? (PLACE_ZONE[code] ?? null) : null;
}

export function normalizePlace(text: string | null): string | null {
  if (!text) return null;
  // Strip accents ("Dubaï", "Saint-Hélier") and accept common French names.
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bhelier\b|\bjersey\b/.test(t)) return "CITY:STHELIER";
  if (/\bdubai\b/.test(t)) return "CITY:DUBAI";
  if (/\bsingapore\b|\bsingapour\b/.test(t)) return "CITY:SINGAPORE";
  if (/\blondon\b|\blondres\b/.test(t)) return "CITY:LONDON";
  if (/\bhong ?kong\b/.test(t)) return "CITY:HONGKONG";
  if (/\bparis\b/.test(t)) return "CITY:PARIS";
  if (/^[a-z]{3}$/i.test(text.trim())) return text.trim().toUpperCase();
  return null; // unrecognised: the engine treats it as unknown
}

const TITLES = /\b(mr|mrs|ms|miss|mx|dr|prof|sir|dame)\b/g;
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").replace(TITLES, " ").replace(/\s+/g, " ").trim();

/** "CASTELL/BRUNO MR" (airline style: SURNAME/GIVEN) -> "Bruno Castell". */
function unAirline(name: string): string {
  const m = name.match(/^\s*([^/]+)\/([^/]+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

export function matchDirector(rawName: string, roster: Director[]): Director | undefined {
  const name = unAirline(rawName);
  const n = norm(name);
  const tokens = n.split(" ").filter(Boolean);
  // Same set of words in any order (handles "Velloso Chandra" and airline order).
  const sameWords = roster.filter((d) => {
    const dt = norm(d.name).split(" ").filter(Boolean);
    return dt.length === tokens.length && dt.every((w) => tokens.includes(w));
  });
  if (sameWords.length === 1) return sameWords[0];
  const exact = roster.find((d) => norm(d.name) === n);
  if (exact) return exact;
  const last = n.split(" ").pop()!;
  const byLast = roster.filter((d) => norm(d.name).split(" ").pop() === last);
  if (byLast.length === 1) return byLast[0];
  return fuzzyDirector(n, roster);
}

/** Edit distance between two strings. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Spelling slips from speech recognition ("Bruno Castel", "Chandra Velaso"): accept only a clear,
 *  unique closest match within a small edit distance; otherwise refuse. */
function fuzzyDirector(n: string, roster: Director[]): Director | undefined {
  const scored = roster
    .map((d) => ({ d, dist: editDistance(n, norm(d.name)) }))
    .sort((x, y) => x.dist - y.dist);
  const best = scored[0];
  if (!best) return undefined;
  const limit = Math.max(2, Math.floor(norm(best.d.name).length * 0.15));
  const runnerUp = scored[1]?.dist ?? Infinity;
  return best.dist <= limit && runnerUp - best.dist >= 3 ? best.d : undefined;
}

export type ToFactsResult = {
  facts: Fact[];
  meetingWindow?: { startUtc: string; endUtc: string };
  rejected: { file: string; reason: string }[];
};

export type ExtractedItem = {
  docId: string;
  extraction: Extraction;
  /** For recordings: start time of each numbered turn, so a claim can cite its timestamp. */
  turnStartsMs?: number[];
};

export function toFacts(items: ExtractedItem[], roster: Director[]): ToFactsResult {
  const facts: Fact[] = [];
  const rejected: ToFactsResult["rejected"] = [];
  let meetingWindow: ToFactsResult["meetingWindow"];

  for (const { docId, extraction, turnStartsMs } of items) {
    const isRecording = !!turnStartsMs;
    if (extraction.document_type === "minutes") {
      const mtz = zoneOrPlace(extraction.meeting.tz, extraction.meeting.place_text);
      const s = localToUtc(extraction.meeting.start_local, mtz);
      const e = localToUtc(extraction.meeting.end_local, mtz);
      if (s && e) meetingWindow = { startUtc: s, endUtc: e };
      else rejected.push({ file: docId, reason: "meeting time or zone not readable" });
    }
    for (const f of extraction.facts) {
      // The minutes and the recording are what the company says; they can never supply travel or hotel
      // evidence, whatever the model was talked into reporting. Claims come only from them.
      const fromClaimSource = isRecording || extraction.document_type === "minutes";
      if ((f.kind === "claimed_location") !== fromClaimSource) {
        rejected.push({ file: docId, reason: `a ${f.kind.replace("_", " ")} cannot come from ${isRecording ? "the recording" : `a ${extraction.document_type.replace("_", " ")} document`}; ignored` });
        continue;
      }
      const dir = matchDirector(f.person_name, roster);
      if (!dir) {
        rejected.push({ file: docId, reason: `name "${f.person_name}" matches no director` });
        continue;
      }
      const cite: Citation = isRecording
        ? { docId, timestampSec: Math.round((turnStartsMs![f.page - 1] ?? 0) / 100) / 10, quote: f.quote }
        : { docId, page: f.page, quote: f.quote };
      if (f.kind === "flight_leg") {
        const dep = localToUtc(f.depart_local, zoneOrPlace(f.depart_tz, f.origin_code));
        const arr = localToUtc(f.arrive_local, zoneOrPlace(f.arrive_tz, f.dest_code));
        if (!f.origin_code || !f.dest_code || !dep || !arr) {
          rejected.push({ file: docId, reason: "flight leg incomplete or zone unknown" });
          continue;
        }
        // Physical sanity: a flight lands after it leaves and lasts under 20 hours (catches AM/PM misreads).
        const hours = (Date.parse(arr) - Date.parse(dep)) / 3_600_000;
        if (!(hours > 0.25 && hours < 20)) {
          rejected.push({ file: docId, reason: `flight times impossible (${hours.toFixed(1)} h in the air); likely misread` });
          continue;
        }
        facts.push({ kind: "flight_leg", directorId: dir.id, originCode: f.origin_code.toUpperCase(), destCode: f.dest_code.toUpperCase(), departUtc: dep, arriveUtc: arr, cite });
      } else if (f.kind === "hotel_stay") {
        const place = normalizePlace(f.place);
        const cin = localToUtc(f.check_in_local, zoneOrPlace(f.check_in_tz, f.place));
        const cout = localToUtc(f.check_out_local, zoneOrPlace(f.check_out_tz, f.place));
        if (!place || !cin || !cout) {
          rejected.push({ file: docId, reason: `hotel stay incomplete, place "${f.place}" or zone unknown` });
          continue;
        }
        const nights = (Date.parse(cout) - Date.parse(cin)) / 86_400_000;
        if (!(nights > 0 && nights < 60)) {
          rejected.push({ file: docId, reason: "hotel check-out is not after check-in (or stay over 60 days); likely misread" });
          continue;
        }
        facts.push({ kind: "hotel_stay", directorId: dir.id, placeCode: place, checkInUtc: cin, checkOutUtc: cout, cite });
      } else {
        const place = normalizePlace(f.place);
        if (!place) {
          rejected.push({ file: docId, reason: `claimed place "${f.place}" not recognised` });
          continue;
        }
        facts.push({ kind: "claimed_location", directorId: dir.id, placeCode: place, source: isRecording ? "recording" : "minutes", cite });
      }
    }
  }
  return { facts, meetingWindow, rejected };
}

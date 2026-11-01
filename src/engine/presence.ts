import { jurisdictionOf, JURISDICTION_NAMES, placeName } from "./gazetteer";
import type { Citation, Director, Fact, Meeting, PresenceResult } from "./types";

// Where was a director during a meeting window, judged ONLY from independent evidence
// (flights and hotel stays). The minutes or the recording can CLAIM a location; a claim never
// proves presence, but a claim that independent evidence contradicts is flagged.
//
// What PROVES presence in a place: a flight that landed there before the meeting and a flight that left from there
// after it, each within 72 hours, with no flight in between; and, unless both flights are within 24 hours of the
// meeting, a hotel stay there that covers it. Anything less (a hotel bill alone, one flight, two flights days apart
// with nowhere to stay) only SUPPORTS presence: a room can be booked and not used, and a director can leave on a
// flight whose boarding pass is not in the pack. Supporting evidence is still enough to show someone was AWAY.

type Anchor = { t: number; j: string | undefined; cite: Citation; what: string; src: "hotel" | "flight"; arrive?: boolean };

/** Both flights must be within this many hours of the meeting. Months apart proves nothing. */
export const MAX_BRACKET_GAP_H = 72;
/** Within this many hours on both sides, the two flights prove presence without a hotel stay. */
export const CLOSE_GAP_H = 24;
type Interval = { from: number; to: number; j: string | undefined; cite: Citation; what: string };

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Invalid timestamp: ${iso}`);
  return t;
};
const H = 3_600_000;
const hours = (x: number) => Math.round(x / H);

const name = (j: string | undefined): string => (j ? (JURISDICTION_NAMES[j] ?? j) : "an unknown place");

export type IndependentLocation =
  /** partial: the evidence points here but does not prove it (see the rule above). */
  | { kind: "located"; j: string; why: string; cites: Citation[]; partial?: boolean }
  | { kind: "in_transit"; why: string; cites: Citation[] }
  /** lastBefore / firstAfter: where the nearest evidence before and after the meeting puts them, at any distance. */
  | { kind: "unknown"; why: string; cites: Citation[]; lastBefore?: string | null; firstAfter?: string | null };

/** Location of one director across [startUtc, endUtc], from flights and hotel stays only. */
export function independentLocation(
  directorId: string,
  facts: Fact[],
  startUtc: string,
  endUtc: string,
): IndependentLocation {
  const S = ms(startUtc);
  const E = ms(endUtc);
  const mine = facts.filter((f) => f.directorId === directorId);

  const stays: Interval[] = [];
  const transits: Interval[] = [];
  const anchors: Anchor[] = [];

  for (const f of mine) {
    if (f.kind === "hotel_stay") {
      const j = jurisdictionOf(f.placeCode);
      const from = ms(f.checkInUtc);
      const to = ms(f.checkOutUtc);
      stays.push({ from, to, j, cite: f.cite, what: `hotel stay in ${placeName(f.placeCode)}` });
      anchors.push({ t: from, j, cite: f.cite, what: `hotel check-in in ${placeName(f.placeCode)}`, src: "hotel" });
      anchors.push({ t: to, j, cite: f.cite, what: `hotel check-out in ${placeName(f.placeCode)}`, src: "hotel" });
    } else if (f.kind === "flight_leg") {
      const dep = ms(f.departUtc);
      const arr = ms(f.arriveUtc);
      transits.push({ from: dep, to: arr, j: undefined, cite: f.cite, what: `flight ${f.originCode}-${f.destCode}` });
      anchors.push({ t: dep, j: jurisdictionOf(f.originCode), cite: f.cite, what: `flight out of ${f.originCode}`, src: "flight", arrive: false });
      anchors.push({ t: arr, j: jurisdictionOf(f.destCode), cite: f.cite, what: `flight into ${f.destCode}`, src: "flight", arrive: true });
    }
  }

  // 1. In the air during any part of the meeting: not physically anywhere for that part.
  const flying = transits.find((x) => x.from < E && x.to > S);
  if (flying) {
    return {
      kind: "in_transit",
      why: `In flight (${flying.what}) during part of the meeting window.`,
      cites: [flying.cite],
    };
  }

  anchors.sort((a, b) => a.t - b.t);
  const flights = anchors.filter((a) => a.src === "flight");
  const lastIn = [...flights].reverse().find((a) => a.t <= S); // the nearest flight event before the meeting
  const firstOut = flights.find((a) => a.t >= E); // and after it
  const covering = stays.find((x) => x.from <= S && x.to >= E);

  // 2. Flew in, then flew out of the same place, both within 72 hours.
  if (lastIn?.arrive && firstOut && !firstOut.arrive && lastIn.j && lastIn.j === firstOut.j && S - lastIn.t <= MAX_BRACKET_GAP_H * H && firstOut.t - E <= MAX_BRACKET_GAP_H * H) {
    const j = lastIn.j;
    const close = S - lastIn.t <= CLOSE_GAP_H * H && firstOut.t - E <= CLOSE_GAP_H * H;
    const stay = covering?.j === j ? covering : undefined;
    const span = `${lastIn.what} ${hours(S - lastIn.t)} h before the meeting and ${firstOut.what} ${hours(firstOut.t - E)} h after it`;
    if (close || stay) {
      return { kind: "located", j, why: `${cap(span)}${stay ? `, with a ${stay.what} covering the meeting` : ""}.`, cites: [lastIn.cite, firstOut.cite, ...(stay ? [stay.cite] : [])] };
    }
    return { kind: "located", j, partial: true, why: `${cap(span)}, with no hotel stay covering the meeting: the director could have left and come back without a document in the pack.`, cites: [lastIn.cite, firstOut.cite] };
  }

  // 3. A hotel stay that covers the meeting, without travel on both sides.
  if (covering) {
    if (!covering.j) {
      return { kind: "unknown", why: `${covering.what} covers the meeting but the place is not recognised.`, cites: [covering.cite] };
    }
    const came = lastIn?.arrive && lastIn.j === covering.j && S - lastIn.t <= MAX_BRACKET_GAP_H * H ? lastIn : undefined;
    const went = firstOut && !firstOut.arrive && firstOut.j === covering.j && firstOut.t - E <= MAX_BRACKET_GAP_H * H ? firstOut : undefined;
    const missing = came ? "no flight out after the meeting" : went ? "no flight in before it" : "no travel on either side";
    return {
      kind: "located",
      j: covering.j,
      partial: true,
      why: `${cap(covering.what)} covers the meeting${came ? ` and there is a ${came.what} before it` : went ? ` and there is a ${went.what} after it` : ""}, but ${missing}.`,
      cites: [covering.cite, ...(came ? [came.cite] : []), ...(went ? [went.cite] : [])],
    };
  }

  // 4. Bracketed by any two pieces of evidence in the same place, with no flight in between.
  const before = [...anchors].reverse().find((a) => a.t <= S);
  const after = anchors.find((a) => a.t >= E);
  if (before && after && (S - before.t > MAX_BRACKET_GAP_H * H || after.t - E > MAX_BRACKET_GAP_H * H)) {
    const days = (x: number) => Math.round(x / 86_400_000);
    return {
      kind: "unknown",
      why: `The nearest evidence is ${days(S - before.t)} day(s) before and ${days(after.t - E)} day(s) after the meeting: too far away to show where the director was (limit ${MAX_BRACKET_GAP_H} hours each side).`,
      cites: [before.cite, after.cite],
      lastBefore: before.j ?? "?",
      firstAfter: after.j ?? "?",
    };
  }
  if (before && after) {
    const flightBetween = transits.some((x) => x.from < after.t && x.to > before.t);
    if (!flightBetween && before.j && after.j && before.j === after.j) {
      return {
        kind: "located",
        j: before.j,
        partial: true,
        why: `Bracketed by the ${before.what} before and the ${after.what} after the meeting, but without a flight in and a flight out.`,
        cites: [before.cite, after.cite],
      };
    }
    if (!flightBetween && before.j && after.j && before.j !== after.j) {
      return {
        kind: "unknown",
        why: `Evidence before (${name(before.j)}) and after (${name(after.j)}) disagree and no flight explains it.`,
        cites: [before.cite, after.cite],
      };
    }
  }

  return {
    kind: "unknown",
    why: "No travel or hotel evidence places this director during the meeting.",
    cites: [],
    lastBefore: before ? (before.j ?? "?") : null,
    firstAfter: after ? (after.j ?? "?") : null,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Presence of one director in `target` during the meeting, with contradiction check against claims.
 *  `director` supplies the residence record, if the firm holds one. */
export function resolvePresence(
  directorId: string,
  meeting: Meeting,
  facts: Fact[],
  target: string,
  director?: Director,
): PresenceResult {
  const loc = independentLocation(directorId, facts, meeting.startUtc, meeting.endUtc);
  const claims = facts.filter(
    (f): f is Extract<Fact, { kind: "claimed_location" }> => f.kind === "claimed_location" && f.directorId === directorId,
  );
  // A claim's place may be one the code cannot map to a jurisdiction ("Lisbon", "by telephone", "St Helier (joined by
  // video from Dubai)"). It still says something: it is never treated as silence.
  const jOf = (c: (typeof claims)[number]) => jurisdictionOf(c.placeCode);
  const label = (c: (typeof claims)[number]) => (jOf(c) ? name(jOf(c)) : `"${placeName(c.placeCode)}"`);
  const pick = (src: "minutes" | "recording") => {
    const mine = claims.filter((c) => c.source === src);
    return mine.find((c) => jOf(c) !== undefined) ?? mine[0];
  };
  const fromMinutes = pick("minutes");
  const fromRecording = pick("recording");
  const claimedJ = [fromMinutes, fromRecording, ...claims].map((c) => c && jOf(c)).find((j) => j !== undefined);
  const sameClaim = (a: (typeof claims)[number], b: (typeof claims)[number]) => (jOf(a) ?? a.placeCode) === (jOf(b) ?? b.placeCode);
  const conflict =
    fromMinutes && fromRecording && !sameClaim(fromMinutes, fromRecording)
      ? { minutes: label(fromMinutes), recording: label(fromRecording), cites: [fromMinutes.cite, fromRecording.cite] }
      : undefined;
  const withConflict = (r: PresenceResult): PresenceResult => (conflict ? { ...r, claimConflict: conflict } : r);
  const resident = director?.residentIn === target;
  const record = director?.residenceRecord ? ` (${director.residenceRecord})` : "";
  // Any claim that does not name the jurisdiction (another place, an unrecognised place, "by telephone") defeats the
  // residence record: the record says where the director lives, not where they were that day.
  const away = claims.find((c) => jOf(c) !== target);
  const trusted = resident && !away;

  return withConflict(fromIndependent());

  function fromIndependent(): PresenceResult {
  if (loc.kind === "located") {
    const here = loc.j === target;
    const unproven = here && loc.partial && !trusted;
    const res: PresenceResult = {
      directorId,
      status: unproven ? "unknown" : here ? "present" : "absent",
      elsewhere: here ? undefined : loc.j,
      basis: !loc.partial ? "independent" : here && trusted ? "resident" : "partial",
      reason: unproven
        ? `Not proven: ${loc.why.charAt(0).toLowerCase()}${loc.why.slice(1)} Proof needs a flight in and a flight out around the meeting, or a residence record.`
        : here && loc.partial
          ? `Lives in ${name(target)}${record}. ${loc.why}`
          : loc.why,
      cites: loc.cites,
    };
    if (claimedJ && claimedJ !== loc.j) {
      res.contradiction = { claimed: name(claimedJ), evidence: name(loc.j) };
      res.cites = [...loc.cites, ...claims.map((c) => c.cite)];
    }
    return res;
  }

  if (loc.kind === "in_transit") {
    const res: PresenceResult = {
      directorId,
      status: "absent",
      basis: "independent",
      reason: loc.why,
      cites: loc.cites,
    };
    if (claimedJ) {
      res.contradiction = { claimed: name(claimedJ), evidence: "in flight" };
      res.cites = [...loc.cites, ...claims.map((c) => c.cite)];
    }
    return res;
  }

  // No evidence near the meeting, and the nearest evidence (if any) leaves them in the jurisdiction: a reviewed
  // residence record places them there. Travel or any claim of another place always wins over the record.
  const nearHome = (j: string | null | undefined) => j === null || j === target;
  if (trusted && nearHome(loc.lastBefore) && nearHome(loc.firstAfter)) {
    return {
      directorId,
      status: "present",
      basis: "resident",
      reason: `Lives in ${name(target)}${record}; no travel evidence or claim places this director elsewhere.`,
      cites: claims.map((c) => c.cite),
    };
  }
  if (resident && away) {
    return {
      directorId,
      status: "unknown",
      basis: "claim_only",
      reason: `Lives in ${name(target)}${record}, but the ${away.source} place${away.source === "minutes" ? "" : "s"} this director in ${label(away)} for this meeting.`,
      cites: claims.map((c) => c.cite),
    };
  }

  // Unknown from independent evidence.
  return {
    directorId,
    status: "unknown",
    basis: claimedJ ? "claim_only" : "none",
    reason: claimedJ
      ? `Only a claim (${name(claimedJ)}) supports this; no independent travel or hotel evidence.`
      : loc.why,
    cites: claims.map((c) => c.cite),
  };
  }
}

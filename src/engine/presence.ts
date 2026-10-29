import { jurisdictionOf, JURISDICTION_NAMES, placeName } from "./gazetteer";
import type { Citation, Fact, Meeting, PresenceResult } from "./types";

// Where was a director during a meeting window, judged ONLY from independent evidence
// (flights and hotel stays). The minutes or the recording can CLAIM a location; a claim never
// proves presence, but a claim that independent evidence contradicts is flagged.

type Anchor = { t: number; j: string | undefined; cite: Citation; what: string };

/** A bracket (arrived before, left after) only counts if both ends are close to the meeting. Months apart proves
 *  nothing: a ferry, a car or a private flight in between would leave no boarding pass in the pack. */
export const MAX_BRACKET_GAP_H = 72;
type Interval = { from: number; to: number; j: string | undefined; cite: Citation; what: string };

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Invalid timestamp: ${iso}`);
  return t;
};

const name = (j: string | undefined): string => (j ? (JURISDICTION_NAMES[j] ?? j) : "an unknown place");

export type IndependentLocation =
  | { kind: "located"; j: string; why: string; cites: Citation[] }
  | { kind: "in_transit"; why: string; cites: Citation[] }
  | { kind: "unknown"; why: string; cites: Citation[] };

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
      anchors.push({ t: from, j, cite: f.cite, what: `hotel check-in in ${placeName(f.placeCode)}` });
      anchors.push({ t: to, j, cite: f.cite, what: `hotel check-out in ${placeName(f.placeCode)}` });
    } else if (f.kind === "flight_leg") {
      const dep = ms(f.departUtc);
      const arr = ms(f.arriveUtc);
      transits.push({ from: dep, to: arr, j: undefined, cite: f.cite, what: `flight ${f.originCode}-${f.destCode}` });
      anchors.push({ t: dep, j: jurisdictionOf(f.originCode), cite: f.cite, what: `departure ${f.originCode}` });
      anchors.push({ t: arr, j: jurisdictionOf(f.destCode), cite: f.cite, what: `arrival ${f.destCode}` });
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

  // 2. A hotel stay that covers the whole meeting window.
  const covering = stays.find((x) => x.from <= S && x.to >= E);
  if (covering) {
    if (!covering.j) {
      return { kind: "unknown", why: `${covering.what} covers the meeting but the place is not recognised.`, cites: [covering.cite] };
    }
    return { kind: "located", j: covering.j, why: `${covering.what} covers the whole meeting.`, cites: [covering.cite] };
  }

  // 3. Bracketed by two anchors in the same place with no flight in between.
  anchors.sort((a, b) => a.t - b.t);
  const before = [...anchors].reverse().find((a) => a.t <= S);
  const after = anchors.find((a) => a.t >= E);
  const gapH = (x: number) => x / 3_600_000;
  if (before && after && (gapH(S - before.t) > MAX_BRACKET_GAP_H || gapH(after.t - E) > MAX_BRACKET_GAP_H)) {
    const days = (x: number) => Math.round(x / 86_400_000);
    return {
      kind: "unknown",
      why: `The nearest evidence is ${days(S - before.t)} day(s) before and ${days(after.t - E)} day(s) after the meeting: too far away to show where the director was (limit ${MAX_BRACKET_GAP_H} hours each side).`,
      cites: [before.cite, after.cite],
    };
  }
  if (before && after) {
    const flightBetween = transits.some((x) => x.from < after.t && x.to > before.t);
    if (!flightBetween && before.j && after.j && before.j === after.j) {
      return {
        kind: "located",
        j: before.j,
        why: `Bracketed by ${before.what} before and ${after.what} after the meeting, with no flight in between.`,
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

  return { kind: "unknown", why: "No travel or hotel evidence places this director during the meeting.", cites: [] };
}

/** Presence of one director in `target` during the meeting, with contradiction check against claims. */
export function resolvePresence(
  directorId: string,
  meeting: Meeting,
  facts: Fact[],
  target: string,
): PresenceResult {
  const loc = independentLocation(directorId, facts, meeting.startUtc, meeting.endUtc);
  const claims = facts.filter(
    (f): f is Extract<Fact, { kind: "claimed_location" }> => f.kind === "claimed_location" && f.directorId === directorId,
  );
  const claimOf = (src: "minutes" | "recording") =>
    claims.filter((c) => c.source === src).map((c) => ({ j: jurisdictionOf(c.placeCode), c })).find((x) => x.j !== undefined);
  const fromMinutes = claimOf("minutes");
  const fromRecording = claimOf("recording");
  const claimedJ = fromMinutes?.j ?? fromRecording?.j ?? claims.map((c) => jurisdictionOf(c.placeCode)).find((j) => j !== undefined);
  const conflict =
    fromMinutes && fromRecording && fromMinutes.j !== fromRecording.j
      ? { minutes: name(fromMinutes.j), recording: name(fromRecording.j), cites: [fromMinutes.c.cite, fromRecording.c.cite] }
      : undefined;
  const withConflict = (r: PresenceResult): PresenceResult => (conflict ? { ...r, claimConflict: conflict } : r);

  return withConflict(fromIndependent());

  function fromIndependent(): PresenceResult {
  if (loc.kind === "located") {
    const present = loc.j === target;
    const res: PresenceResult = {
      directorId,
      status: present ? "present" : "absent",
      elsewhere: present ? undefined : loc.j,
      basis: "independent",
      reason: loc.why,
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

import { jurisdictionOf, JURISDICTION_NAMES, placeName } from "./gazetteer";
import type { Citation, Director, Fact, Meeting, PresenceResult } from "./types";

// Where was a director during a meeting window, judged ONLY from independent evidence
// (flights and hotel stays). The minutes or the recording can CLAIM a location; a claim never
// proves presence, but a claim that independent evidence contradicts is flagged.

type Anchor = { t: number; j: string | undefined; cite: Citation; what: string; src: "hotel" | "flight" };

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
  /** hotelOnly: only hotel stays place them (a room can be booked and never used), so it supports but does not prove. */
  | { kind: "located"; j: string; why: string; cites: Citation[]; hotelOnly?: boolean }
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
      anchors.push({ t: dep, j: jurisdictionOf(f.originCode), cite: f.cite, what: `departure ${f.originCode}`, src: "flight" });
      anchors.push({ t: arr, j: jurisdictionOf(f.destCode), cite: f.cite, what: `arrival ${f.destCode}`, src: "flight" });
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
  const H72 = MAX_BRACKET_GAP_H * 3_600_000;
  const flights = anchors.filter((a) => a.src === "flight");
  // Travel that backs up a stay in place j: the last flight before the meeting landed in j (within 72 hours), or the
  // first flight after it left from j (within 72 hours). Either way no flight is missing in between.
  const travelIn = (j: string): Anchor | undefined => {
    const lastIn = [...flights].reverse().find((a) => a.t <= S);
    if (lastIn && lastIn.j === j && S - lastIn.t <= H72 && lastIn.what.startsWith("arrival")) return lastIn;
    const firstOut = flights.find((a) => a.t >= E);
    if (firstOut && firstOut.j === j && firstOut.t - E <= H72 && firstOut.what.startsWith("departure")) return firstOut;
    return undefined;
  };

  // 2. A hotel stay that covers the whole meeting window. On its own it supports presence but does not prove it.
  const covering = stays.find((x) => x.from <= S && x.to >= E);
  if (covering) {
    if (!covering.j) {
      return { kind: "unknown", why: `${covering.what} covers the meeting but the place is not recognised.`, cites: [covering.cite] };
    }
    const backed = travelIn(covering.j);
    if (backed) {
      return { kind: "located", j: covering.j, why: `${covering.what} covers the whole meeting, backed by the ${backed.what}.`, cites: [covering.cite, backed.cite] };
    }
    return { kind: "located", j: covering.j, hotelOnly: true, why: `${covering.what} covers the whole meeting, but no travel backs it up.`, cites: [covering.cite] };
  }

  // 3. Bracketed by two anchors in the same place with no flight in between.
  const before = [...anchors].reverse().find((a) => a.t <= S);
  const after = anchors.find((a) => a.t >= E);
  const gapH = (x: number) => x / 3_600_000;
  if (before && after && (gapH(S - before.t) > MAX_BRACKET_GAP_H || gapH(after.t - E) > MAX_BRACKET_GAP_H)) {
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
        why: `Bracketed by ${before.what} before and ${after.what} after the meeting, with no flight in between.`,
        cites: [before.cite, after.cite],
        hotelOnly: before.src === "hotel" && after.src === "hotel" ? true : undefined,
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
  const resident = director?.residentIn === target;
  const record = director?.residenceRecord ? ` (${director.residenceRecord})` : "";
  // A claim that puts a resident somewhere else (e.g. "by video from Dubai") defeats the residence record.
  const claimElsewhere = claims.some((c) => { const j = jurisdictionOf(c.placeCode); return j !== undefined && j !== target; });

  return withConflict(fromIndependent());

  function fromIndependent(): PresenceResult {
  if (loc.kind === "located") {
    const here = loc.j === target;
    // A hotel stay alone supports presence but does not prove it, unless the director also lives here.
    const supportedOnly = here && loc.hotelOnly && !(resident && !claimElsewhere);
    const res: PresenceResult = {
      directorId,
      status: supportedOnly ? "unknown" : here ? "present" : "absent",
      elsewhere: here ? undefined : loc.j,
      basis: !loc.hotelOnly ? "independent" : here && resident && !claimElsewhere ? "resident" : "hotel_only",
      reason: supportedOnly
        ? `Only a hotel bill places this director in ${name(target)}: ${loc.why} A hotel stay supports presence but does not prove it (a room can be booked and not used). Travel evidence, an attendance register or a residence record would.`
        : here && loc.hotelOnly && resident
          ? `Lives in ${name(target)}${record}, and ${loc.why.charAt(0).toLowerCase()}${loc.why.slice(1)}`
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
  // residence record places them there. Travel or a claim elsewhere always wins over the record.
  const nearHome = (j: string | null | undefined) => j === null || j === target;
  if (resident && !claimElsewhere && nearHome(loc.lastBefore) && nearHome(loc.firstAfter)) {
    return {
      directorId,
      status: "present",
      basis: "resident",
      reason: `Lives in ${name(target)}${record}; no travel evidence or claim places this director elsewhere.`,
      cites: claims.map((c) => c.cite),
    };
  }
  if (resident && claimElsewhere) {
    const away = claims.find((c) => { const j = jurisdictionOf(c.placeCode); return j !== undefined && j !== target; })!;
    return {
      directorId,
      status: "unknown",
      basis: "claim_only",
      reason: `Lives in ${name(target)}${record}, but the ${away.source} place${away.source === "minutes" ? "" : "s"} this director in ${name(jurisdictionOf(away.placeCode))}.`,
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

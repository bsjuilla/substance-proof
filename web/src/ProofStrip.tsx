import { useEffect, useState } from "react";
import { placeName } from "../../src/engine/gazetteer";
import type { Loaded } from "./types";

type Result = Loaded["result"];
type Cite = { docId: string; page?: number; timestampSec?: number; quote?: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Highlights the place that contradicts the minutes inside a quote, without changing the text. */
function mark(text: string, place: string | undefined) {
  if (!place) return text;
  const lower = text.toLowerCase();
  const phrase = lower.includes(`hotel in ${place.toLowerCase()}`) ? `hotel in ${place}` : place;
  const i = lower.indexOf(phrase.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + phrase.length)}</mark>{text.slice(i + phrase.length)}</>;
}

/** The hero case in one glance: what the minutes claim, what the recording and the evidence say, and the verdict.
 *  Every quote is read from the recorded live run, so nothing on this strip is written by hand. */
export function ProofStrip({ id, onOpen }: { id: string; onOpen: () => void }) {
  const [r, setR] = useState<Result | null>(null);
  useEffect(() => {
    fetch(`demo/${id}/result.json`).then((x) => (x.ok ? x.json() : null)).then(setR).catch(() => setR(null));
  }, [id]);
  if (!r) return <div className="proof-placeholder" aria-hidden="true" />;

  const p = r.evaluation.presence.find((x) => x.contradiction && x.claimConflict) ?? r.evaluation.presence.find((x) => x.contradiction);
  if (!p) return null;
  const name = r.company.directors.find((d) => d.id === p.directorId)?.name ?? p.directorId;
  const cites: Cite[] = [...p.cites, ...(p.claimConflict?.cites ?? [])];
  const minutes = cites.find((c) => c.docId.endsWith("minutes.pdf"));
  const rec = cites.find((c) => c.timestampSec != null);
  const evidence = r.facts.find((f) => f.directorId === p.directorId && (f.kind === "hotel_stay" || f.kind === "flight_leg"));
  const law = r.evaluation.tests.find((t) => t.status === "fail" && t.basis === "law");
  const evidenceLabel = evidence?.kind === "hotel_stay" ? "The hotel bill says" : "The travel document says";
  const place = evidence?.kind === "hotel_stay" ? placeName(evidence.placeCode) : undefined;
  const finding = p.reason.charAt(0).toUpperCase() + p.reason.slice(1);

  return (
    <section className="proof" aria-labelledby="proof-h">
      <p className="proof-kicker" id="proof-h">One real case, read by Muse Spark and Muse Voice Transcribe · {r.company.name}, {r.meetingDateText}</p>
      <ol className="proof-row">
        <li className="proof-card claim">
          <span className="proof-src">The minutes say</span>
          <span className="proof-meta">Minutes · p{minutes?.page ?? 1}</span>
          <q className="big">{minutes?.quote ?? "present"}</q>
          <span className="proof-who">{name}</span>
        </li>
        {rec && (
          <li className="proof-card against">
            <span className="proof-src">The recording says</span>
            <span className="proof-meta">Recording · {mmss(rec.timestampSec!)}</span>
            <q>{mark(rec.quote ?? "", place)}</q>
            <span className="proof-who">Muse Voice Transcribe</span>
          </li>
        )}
        {evidence && (
          <li className="proof-card against">
            <span className="proof-src">{evidenceLabel}</span>
            <span className="proof-meta">{evidence.cite.docId.split("/").pop()}</span>
            <b className="proof-finding">{finding}</b>
            <span className="proof-meta">Quoted from the bill: “{evidence.cite.quote}”</span>
          </li>
        )}
        <li className="proof-card decided">
          <span className="proof-src bad">Rules engine (code, not AI)</span>
          <b className="proof-fail">✕ {r.evaluation.verdict}</b>
          <span>{law ? `${law.label}: not met` : "Needs review"}</span>
          <span className="proof-meta">{law?.citation}</span>
        </li>
      </ol>
      <div className="proof-cta">
        <button className="btn primary big" onClick={onOpen}>Open this case →</button>
        <span className="muted">Every finding links to its page or second. Synthetic documents; real model outputs. No API key needed.</span>
      </div>
    </section>
  );
}

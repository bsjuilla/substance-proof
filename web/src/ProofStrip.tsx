import { useEffect, useState } from "react";
import { placeName } from "../../src/engine/gazetteer";
import { verdictWord, type Loaded } from "./types";
import { Icon } from "./Icon";

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
    <section className="ledger-wrap" aria-labelledby="proof-h">
      <header className="section-head">
        <p className="eyebrow">Demo case (synthetic) · {r.company.name} · {r.meetingDateText}</p>
        <h2 id="proof-h">Three sources. One claim. They don't agree.</h2>
      </header>
      <ol className="ledger">
        <li className="claim">
          <span className="l-src">The minutes say<small>Minutes · page {minutes?.page ?? 1} · {name}</small></span>
          <q className="l-quote">{minutes?.quote ?? "present"}</q>
          <span className="l-tag claim">Claim</span>
        </li>
        {rec && (
          <li>
            <span className="l-src">The recording says<small>recording.wav · {mmss(rec.timestampSec!)} · Muse Voice Transcribe</small></span>
            <q className="l-quote">{mark(rec.quote ?? "", place)}</q>
            <span className="l-tag bad"><Icon name="cross" /> Contradicts</span>
          </li>
        )}
        {evidence && (
          <li>
            <span className="l-src">{evidenceLabel}<small>{evidence.cite.docId.split("/").pop()} · quoted “{evidence.cite.quote}”</small></span>
            <span className="l-quote finding">{finding}</span>
            <span className="l-tag bad"><Icon name="cross" /> Contradicts</span>
          </li>
        )}
        <li className="decided">
          <span className="l-src">Rules engine<small>Code, not the model · {law?.citation}</small></span>
          <span className="l-quote l-verdict"><b>{verdictWord(r.evaluation.verdict)}</b> {law ? `${law.label}.` : "Needs review."}</span>
          <button className="btn primary" onClick={onOpen}>Open the case <Icon name="arrow-right" /></button>
        </li>
      </ol>
      <p className="muted small">Every finding links to its page or second. Synthetic documents; real model outputs; no API key needed.</p>
    </section>
  );
}

import { useEffect, useState } from "react";
import type { Loaded } from "./types";

type Result = Loaded["result"];
type Cite = { docId: string; page?: number; timestampSec?: number; quote?: string };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The hero case in one glance: what the minutes claim, what the recording and the evidence say, and the verdict.
 *  Every quote is read from the recorded live run, so nothing on this strip is written by hand. */
export function ProofStrip({ id, onOpen }: { id: string; onOpen: () => void }) {
  const [r, setR] = useState<Result | null>(null);
  useEffect(() => {
    fetch(`demo/${id}/result.json`).then((x) => (x.ok ? x.json() : null)).then(setR).catch(() => setR(null));
  }, [id]);
  if (!r) return null;

  const p = r.evaluation.presence.find((x: any) => x.contradiction && x.claimConflict) ?? r.evaluation.presence.find((x: any) => x.contradiction);
  if (!p) return null;
  const name = r.company.directors.find((d) => d.id === p.directorId)?.name ?? p.directorId;
  const cites: Cite[] = [...p.cites, ...(p.claimConflict?.cites ?? [])];
  const minutes = cites.find((c) => c.docId.endsWith("minutes.pdf"));
  const rec = cites.find((c) => c.timestampSec != null);
  const evidence = r.facts.find((f: any) => f.directorId === p.directorId && (f.kind === "hotel_stay" || f.kind === "flight_leg"));
  const law = r.evaluation.tests.find((t) => t.status === "fail" && t.basis === "law");
  const evidenceLabel = evidence?.kind === "hotel_stay" ? "Hotel bill" : "Boarding pass";
  const shortName = (d: string) => d.split("/").pop();

  return (
    <section className="proof" aria-labelledby="proof-h">
      <p className="proof-kicker" id="proof-h">One real case, read by Muse Spark and Muse Voice Transcribe · {r.company.name}, {r.meetingDateText}</p>
      <ol className="proof-row">
        <li className="proof-card claim">
          <span className="proof-src">Minutes · p{minutes?.page ?? 1}</span>
          <q>{minutes?.quote ?? "present"}</q>
          <span className="proof-who">{name}</span>
        </li>
        {rec && (
          <li className="proof-card against">
            <span className="proof-src">Recording · {mmss(rec.timestampSec!)}</span>
            <q>{rec.quote}</q>
            <span className="proof-who">Muse Voice Transcribe</span>
          </li>
        )}
        {evidence && (
          <li className="proof-card against">
            <span className="proof-src">{evidenceLabel} · {shortName(evidence.cite.docId)}</span>
            <q>{evidence.cite.quote}</q>
            <span className="proof-who">Engine: {p.reason}</span>
          </li>
        )}
        <li className="proof-card decided">
          <span className="proof-src">Rules engine (code, not AI)</span>
          <b className="proof-fail">✕ {r.evaluation.verdict}</b>
          <span>{law ? `${law.label}: not met` : "Needs review"}</span>
          <span className="proof-who">{law?.citation}</span>
        </li>
      </ol>
      <div className="actions">
        <button className="btn primary" onClick={onOpen}>Open this case: every finding links to its page or second</button>
        <span className="muted" style={{ fontSize: "var(--step--1)" }}>Synthetic documents; real model outputs. No API key needed.</span>
      </div>
    </section>
  );
}

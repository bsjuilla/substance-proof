import { useEffect, useRef } from "react";
import type { Citation, RunResult } from "./types";

type Props = { cite: Citation | null; result: RunResult; fileBase: string; onClose: () => void };

const ROLE: Record<string, string> = { minutes: "Minutes", boarding_pass: "Travel document", hotel_folio: "Hotel bill", recording: "Meeting recording", other: "Document" };
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
/** Model control tokens that leaked into the transcript, e.g. "speaker_A|>". Shown dimmed, never hidden. */
const STRAY = /<\||\|>/;

/** Opens the cited document at the cited page, or the recording at the cited second with the transcript.
 *  The side column puts the minutes' claim next to what this source says, so the reason it matters is visible. */
export function Viewer({ cite, result, fileBase, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (cite && !d.open) d.showModal();
    if (!cite && d.open) d.close();
  }, [cite]);

  if (!cite) return <dialog ref={dlg} className="viewer" onClose={onClose} />;
  const url = fileBase + cite.docId.split("/").map(encodeURIComponent).join("/");
  const ext = cite.docId.split(".").pop()?.toLowerCase();
  const doc = result.docs.find((d) => d.docId === cite.docId);
  const t = cite.timestampSec ?? 0;

  // Whose evidence is this, what do the minutes claim for them, and what did the engine conclude?
  const fact = result.facts.find((f) => f.cite.docId === cite.docId && (cite.quote == null || f.cite.quote === cite.quote))
    ?? result.facts.find((f) => f.cite.docId === cite.docId);
  const dirId = fact?.directorId;
  const director = result.company.directors.find((d) => d.id === dirId);
  const presence = result.evaluation.presence.find((p) => p.directorId === dirId);
  const claim = result.facts.find((f) => f.directorId === dirId && f.kind === "claimed_location" && f.source === "minutes");
  const isMinutes = doc?.kind === "minutes";
  const role = ROLE[doc?.kind ?? "other"] ?? "Document";
  const title = [role, director?.name, cite.page ? `page ${cite.page}` : cite.timestampSec != null ? mmss(t) : ""].filter(Boolean).join(" · ");
  const seek = () => { if (audio.current) { audio.current.currentTime = Math.max(0, t - 1); audio.current.focus(); } };

  return (
    <dialog ref={dlg} className="viewer" onClose={onClose} aria-labelledby="viewer-h">
      <header>
        <div>
          <h3 id="viewer-h">{title}</h3>
          <p className="mono muted" style={{ fontSize: ".75rem" }}>{cite.docId}</p>
        </div>
        <span className="spacer" />
        <a className="btn small" href={url} target="_blank" rel="noreferrer">Open file</a>
        <button className="btn small" onClick={() => dlg.current?.close()}>Close <kbd>Esc</kbd></button>
      </header>
      <div className="viewer-grid">
        <aside className="viewer-aside stack" style={{ ["--gap" as any]: ".75rem" }}>
          {claim && !isMinutes && (
            <div className="said claim">
              <span className="proof-src">The minutes say</span>
              <q>{claim.cite.quote}</q>
            </div>
          )}
          {cite.quote && (
            <div className={`said ${isMinutes ? "claim" : presence?.status === "present" ? "ok" : "against"}`}>
              <span className="proof-src">{isMinutes ? "The minutes say" : `This ${ext === "wav" ? "recording" : "document"} says`}</span>
              <q>{cite.quote}</q>
              <span className="muted" style={{ fontSize: ".75rem" }}>Quoted by Muse {ext === "wav" ? "Voice Transcribe and Muse Spark" : "Spark"}</span>
            </div>
          )}
          {presence && <p className="muted" style={{ fontSize: "var(--step--1)" }}>The engine concluded: {presence.reason}</p>}
        </aside>
        <div className="viewer-doc">
          {ext === "pdf" && <iframe src={`${url}#page=${cite.page ?? 1}&toolbar=0&navpanes=0&view=FitH`} title={title} />}
          {(ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") && <img src={url} alt={title} style={{ border: "1px solid var(--border)" }} />}
          {ext === "wav" && (
            <div className="stack">
              <audio ref={audio} controls src={url} onLoadedMetadata={seek} style={{ width: "100%" }} />
              <div><button className="btn small primary" onClick={() => { seek(); audio.current?.play(); }}>Play from the cited turn · {mmss(t)}</button></div>
              <p className="muted" style={{ fontSize: "var(--step--1)" }}>Transcript by Muse Voice Transcribe (turn-level timestamps), exactly as received. The cited turn is highlighted.</p>
              <div className="stack" style={{ ["--gap" as any]: ".25rem" }}>
                {doc?.transcript?.map((turn, i) => {
                  const hit = t * 1000 >= turn.startMs - 500 && t * 1000 <= turn.endMs + 500;
                  return (
                    <div key={i} className={`turn${hit ? " hit" : ""}${STRAY.test(turn.text) ? " stray" : ""}`}>
                      <span className="mono muted">{(turn.startMs / 1000).toFixed(1)}s{turn.speaker ? ` · speaker ${turn.speaker}` : ""}</span> {turn.text}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

import { lazy, Suspense, useEffect, useRef } from "react";
import type { Citation, RunResult } from "./types";
// pdf.js is large, so it loads only when a document is opened.
const PdfPage = lazy(() => import("./PdfPage").then((m) => ({ default: m.PdfPage })));

type Props = { cite: (Citation & { directorId?: string }) | null; result: RunResult; fileBase: string; onClose: () => void };

const ROLE: Record<string, string> = { minutes: "Minutes", boarding_pass: "Travel document", hotel_folio: "Hotel bill", recording: "Meeting recording", other: "Document" };
const LABEL: Record<string, string> = { "qr code": "a QR code", barcode: "a barcode", face: "a face", "handwritten signature": "a signature" };
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
/** Model control tokens that leaked into the transcript, e.g. "speaker_A|>". Shown dimmed, never hidden. */
const STRAY = /<\||\|>/;

/** Opens the cited document at the cited page, or the recording at the cited second with the transcript.
 *  The side column puts the minutes' claim next to what this source says, so the reason it matters is visible. */
export function Viewer({ cite, result, fileBase, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLMediaElement>(null);

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
  const isMedia = ["wav", "mp3", "m4a", "mp4", "webm", "ogg"].includes(ext ?? "");
  const isVideo = ext === "mp4" || ext === "webm";

  // Whose evidence is this, what do the minutes claim for them, and what did the engine conclude?
  const fact = result.facts.find((f) => f.cite.docId === cite.docId && (cite.quote == null || f.cite.quote === cite.quote))
    ?? result.facts.find((f) => f.cite.docId === cite.docId);
  const dirId = cite.directorId ?? fact?.directorId;
  const director = result.company.directors.find((d) => d.id === dirId);
  const presence = result.evaluation.presence.find((p) => p.directorId === dirId);
  const claim = result.facts.find((f) => f.directorId === dirId && f.kind === "claimed_location" && f.source === "minutes");
  const isMinutes = doc?.kind === "minutes";
  const role = ROLE[doc?.kind ?? "other"] ?? "Document";
  const title = [role, director?.name, cite.page ? `page ${cite.page}` : cite.timestampSec != null ? mmss(t) : ""].filter(Boolean).join(" · ");
  const seek = () => { if (audio.current) audio.current.currentTime = Math.max(0, t - 1); };

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
              <span className="proof-src">{isMinutes ? "The minutes say" : `This ${isMedia ? "recording" : "document"} says`}</span>
              <q>{cite.quote}</q>
              <span className="muted" style={{ fontSize: ".75rem" }}>Quoted by Muse {isMedia ? "Voice Transcribe and Muse Spark" : "Spark"}</span>
            </div>
          )}
          {presence && <p className="muted" style={{ fontSize: "var(--step--1)" }}>The engine concluded: {presence.reason}</p>}
        </aside>
        <div className="viewer-doc">
          {ext === "pdf" && <Suspense fallback={<p className="small muted">Opening the page…</p>}><PdfPage url={url} page={cite.page ?? 1} quote={cite.quote} near={director ? [director.name, director.name.split(" ").pop()!] : []} title={title} /></Suspense>}
          {(ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") && (
            <div className="stack" style={{ ["--gap" as any]: ".5rem" }}>
              {doc?.redactions?.length ? (
                <p className="small muted" role="status">
                  SAM 3.1 found and blacked out {doc.redactions.map((r) => LABEL[r.label] ?? r.label).join(", ")} before this image was sent to Muse Spark. The black boxes show what the reader never saw.
                </p>
              ) : null}
              <div className="img-wrap">
                <img src={url} alt={title} />
                {doc?.redactions?.map((r, i) => (
                  <span key={i} className="redacted" title={`Masked by SAM 3.1: ${r.label}${r.c ? ` (${Math.round(r.c * 100)}% confidence)` : ""}`}
                    style={{ left: `${(r.x1 / r.w) * 100}%`, top: `${(r.y1 / r.h) * 100}%`, width: `${((r.x2 - r.x1) / r.w) * 100}%`, height: `${((r.y2 - r.y1) / r.h) * 100}%` }}>
                    <span>{(LABEL[r.label] ?? r.label).replace(/^an? /, "")}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {isMedia && (
            <div className="stack">
              {isVideo
                ? <video ref={audio as React.RefObject<HTMLVideoElement>} controls src={url} onLoadedMetadata={seek} style={{ width: "100%", maxHeight: "40dvh", background: "#000" }} />
                : <audio ref={audio as React.RefObject<HTMLAudioElement>} controls src={url} onLoadedMetadata={seek} style={{ width: "100%" }} />}
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

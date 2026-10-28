import { useEffect, useRef } from "react";
import type { Citation, RunResult } from "./types";

type Props = { cite: Citation | null; result: RunResult; fileBase: string; onClose: () => void };

/** Opens the cited document at the cited page, or the recording at the cited second with the transcript. */
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

  return (
    <dialog ref={dlg} className="viewer" onClose={onClose} aria-labelledby="viewer-h">
      <header>
        <h3 id="viewer-h" className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--step-0)" }}>
          {cite.docId}{cite.page ? ` · page ${cite.page}` : ""}{cite.timestampSec != null ? ` · ${cite.timestampSec}s` : ""}
        </h3>
        <span className="spacer" />
        <a className="btn small" href={url} target="_blank" rel="noreferrer">Open file</a>
        <button className="btn small" onClick={() => dlg.current?.close()}>Close</button>
      </header>
      <div className="body stack">
        {cite.quote && (
          <p className="note">Quoted by the extractor: <q>{cite.quote}</q></p>
        )}
        {ext === "pdf" && <iframe src={`${url}#page=${cite.page ?? 1}`} title={`Document ${cite.docId}`} />}
        {(ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") && <img src={url} alt={`Document ${cite.docId}`} style={{ border: "1px solid var(--border)" }} />}
        {ext === "wav" && (
          <div className="stack">
            <audio
              ref={audio}
              controls
              src={url}
              onLoadedMetadata={() => {
                if (audio.current) audio.current.currentTime = Math.max(0, t - 1);
              }}
            />
            <p className="muted" style={{ fontSize: "var(--step--1)" }}>Transcript by Muse Voice Transcribe (turn-level timestamps). The cited turn is highlighted.</p>
            <div className="stack" style={{ ["--gap" as any]: ".25rem" }}>
              {doc?.transcript?.map((turn, i) => {
                const hit = t * 1000 >= turn.startMs - 500 && t * 1000 <= turn.endMs + 500;
                return (
                  <div key={i} className={`turn${hit ? " hit" : ""}`}>
                    <span className="mono muted">{(turn.startMs / 1000).toFixed(1)}s{turn.speaker ? ` · speaker ${turn.speaker}` : ""}</span> {turn.text}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

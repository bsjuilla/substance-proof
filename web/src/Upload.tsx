import { useState } from "react";
import type { Loaded } from "./types";

type Director = { name: string; isChair: boolean; strategic: boolean };

const toBase64 = (f: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => bad(r.error);
    r.readAsDataURL(f);
  });

/** Live mode only: analyse your own meeting pack on this machine (your key stays in .env on the server). */
export function Upload({ onLoaded }: { onLoaded: (l: Loaded) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("JE");
  const [quorum, setQuorum] = useState(2);
  const [mode, setMode] = useState("in_person");
  const [isStrategic, setStrategic] = useState(false);
  const [recordsKept, setRecordsKept] = useState("unknown");
  const [directors, setDirectors] = useState<Director[]>([{ name: "", isChair: true, strategic: true }, { name: "", isChair: false, strategic: true }]);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setDir = (i: number, patch: Partial<Director>) => setDirectors((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const addFiles = (list: FileList | null) => list && setFiles((fs) => [...fs, ...Array.from(list).filter((f) => /\.(pdf|png|jpe?g|webp|wav)$/i.test(f.name))]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        setup: { companyName, jurisdiction, quorum, mode, isStrategic, recordsKept, directors },
        files: await Promise.all(files.map(async (f) => ({ name: f.name, base64: await toBase64(f) }))),
      };
      const r = await fetch("/api/analyze-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Analysis failed");
      onLoaded(j);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="up-h">
      <h2 id="up-h">Analyse your own meeting pack</h2>
      <p className="muted" style={{ fontSize: "var(--step--1)" }}>Runs on this computer with your Meta API key. Use test or synthetic documents only.</p>
      <div className="row">
        <div className="field" style={{ flex: "2 1 14rem" }}>
          <label htmlFor="co">Company name</label>
          <input id="co" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="j">Rules</label>
          <select id="j" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            <option value="JE">Jersey (Economic Substance Law)</option>
            <option value="SG">Singapore (IRAS control and management)</option>
          </select>
        </div>
        <div className="field" style={{ width: "6rem" }}>
          <label htmlFor="q">Quorum</label>
          <input id="q" type="number" min={1} max={12} value={quorum} onChange={(e) => setQuorum(Number(e.target.value))} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="m">Meeting held</label>
          <select id="m" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="in_person">In person</option><option value="hybrid">Hybrid</option><option value="virtual">By video only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rk">Records kept in the jurisdiction?</label>
          <select id="rk" value={recordsKept} onChange={(e) => setRecordsKept(e.target.value)}>
            <option value="unknown">Not stated</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </div>
        <label className="row" style={{ alignItems: "center", gap: ".4rem" }}>
          <input type="checkbox" checked={isStrategic} onChange={(e) => setStrategic(e.target.checked)} /> Strategic decisions taken
        </label>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend>Directors</legend>
        {directors.map((d, i) => (
          <div className="row" key={i}>
            <input aria-label={`Director ${i + 1} name`} placeholder="Full name" value={d.name} onChange={(e) => setDir(i, { name: e.target.value })} style={{ flex: "1 1 12rem", minHeight: "2.5rem", padding: ".4rem .6rem", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }} />
            <label><input type="checkbox" checked={d.isChair} onChange={(e) => setDir(i, { isChair: e.target.checked })} /> Chair</label>
            <label><input type="checkbox" checked={d.strategic} onChange={(e) => setDir(i, { strategic: e.target.checked })} /> Strategic authority</label>
          </div>
        ))}
        <div><button type="button" className="btn small" onClick={() => setDirectors((ds) => [...ds, { name: "", isChair: false, strategic: true }])}>Add director</button></div>
      </fieldset>
      <div
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        <p>Drop the minutes, boarding passes, e-tickets, hotel bills and the meeting recording (.wav) here.</p>
        <p style={{ marginTop: ".5rem" }}>
          <label className="btn small">Choose files<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.wav" className="sr-only" onChange={(e) => addFiles(e.target.files)} /></label>
        </p>
        {files.length > 0 && <p className="muted" style={{ marginTop: ".5rem" }}>{files.length} file(s): {files.map((f) => f.name).join(", ")}</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy || files.length === 0}>{busy ? "Reading documents…" : "Analyse"}</button>
        {busy && <span className="progress muted"><span className="spin" aria-hidden="true" /> About 30–90 seconds. Muse Spark is reading each file.</span>}
      </div>
    </form>
  );
}

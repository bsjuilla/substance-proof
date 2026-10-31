import { useState } from "react";
import type { Loaded } from "./types";

type Director = { name: string; isChair: boolean; strategic: boolean; resident: boolean };
type Role = "minutes" | "travel" | "hotel" | "recording";
type Picked = { file: File; role: Role };
const ROLES: [Role, string][] = [["minutes", "Minutes"], ["travel", "Boarding pass / e-ticket"], ["hotel", "Hotel bill"], ["recording", "Meeting recording"]];

/** A first guess from the file name; the person confirms it, and the engine uses their answer, not the model's. */
const guessRole = (n: string): Role => (/\.(wav|mp3|m4a|mp4|webm|ogg)$/i.test(n) ? "recording" : /minute/i.test(n) ? "minutes" : /folio|hotel|stay|bill|invoice/i.test(n) ? "hotel" : "travel");

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
  const [quorum, setQuorum] = useState(""); // from the articles; never assumed
  const [mode, setMode] = useState("in_person");
  const [isStrategic, setStrategic] = useState(false);
  const [recordsKept, setRecordsKept] = useState("unknown");
  const [minutesRecord, setMinutesRecord] = useState("unknown");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [directors, setDirectors] = useState<Director[]>([{ name: "", isChair: true, strategic: true, resident: false }, { name: "", isChair: false, strategic: true, resident: false }]);
  const [files, setFiles] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setDir = (i: number, patch: Partial<Director>) => setDirectors((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const addFiles = (list: FileList | null) =>
    list && setFiles((fs) => [...fs, ...Array.from(list).filter((f) => /\.(pdf|png|jpe?g|webp|wav|mp3|m4a|mp4|webm|ogg)$/i.test(f.name)).map((file) => ({ file, role: guessRole(file.name) }))]);
  const setRole = (i: number, role: Role) => setFiles((fs) => fs.map((p, k) => (k === i ? { ...p, role } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = {
        setup: { companyName, jurisdiction, quorum: Number(quorum), mode, isStrategic, recordsKept, minutesRecordStrategic: isStrategic ? minutesRecord : "unknown", date, start, end, directors },
        files: await Promise.all(files.map(async (p) => ({ name: p.file.name, role: p.role, base64: await toBase64(p.file) }))),
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
        <div className="field" style={{ width: "9rem" }}>
          <label htmlFor="q">Quorum (from the articles)</label>
          <input id="q" type="number" min={1} max={12} step={1} required value={quorum} onChange={(e) => setQuorum(e.target.value)} />
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
      <div className="row">
        <div className="field">
          <label htmlFor="md">Meeting date</label>
          <input id="md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ms">Scheduled start</label>
          <input id="ms" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="me">Scheduled end</label>
          <input id="me" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <p className="small muted" style={{ flex: "1 1 18rem" }}>Local time where the board met, from the calendar invite. The minutes are checked against it. If you leave it empty, the minutes' own time is used and flagged.</p>
      </div>
      {isStrategic && (
        <div className="field" style={{ maxWidth: "26rem" }}>
          <label htmlFor="mr">Do the minutes record the strategic decisions?</label>
          <select id="mr" value={minutesRecord} onChange={(e) => setMinutesRecord(e.target.value)}>
            <option value="unknown">Not checked</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </div>
      )}
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend>Directors</legend>
        {directors.map((d, i) => (
          <div className="row" key={i}>
            <input aria-label={`Director ${i + 1} name`} placeholder="Full name" value={d.name} onChange={(e) => setDir(i, { name: e.target.value })} style={{ flex: "1 1 12rem", minHeight: "2.5rem", padding: ".4rem .6rem", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }} />
            <label><input type="checkbox" checked={d.isChair} onChange={(e) => setDir(i, { isChair: e.target.checked })} /> Chair</label>
            <label><input type="checkbox" checked={d.strategic} onChange={(e) => setDir(i, { strategic: e.target.checked })} /> Strategic authority</label>
            <label title="Tick only if your firm holds a reviewed residence record. Travel or a claim elsewhere still overrides it."><input type="checkbox" checked={d.resident} onChange={(e) => setDir(i, { resident: e.target.checked })} /> Lives in {jurisdiction === "SG" ? "Singapore" : "Jersey"} (record on file)</label>
          </div>
        ))}
        <div><button type="button" className="btn small" onClick={() => setDirectors((ds) => [...ds, { name: "", isChair: false, strategic: true, resident: false }])}>Add director</button></div>
      </fieldset>
      <div
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        <p>Drop the minutes, boarding passes, e-tickets, hotel bills and the meeting recording (audio or video, any length) here.</p>
        <p style={{ marginTop: ".5rem" }}>
          <label className="btn small">Choose files<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.wav,.mp3,.m4a,.mp4,.webm,.ogg" className="sr-only" onChange={(e) => addFiles(e.target.files)} /></label>
        </p>
      </div>
      {files.length > 0 && (
        <ul className="file-roles" aria-label="What each file is">
          {files.map((p, i) => (
            <li key={i}>
              <span className="mono">{p.file.name}</span>
              <select aria-label={`What ${p.file.name} is`} value={p.role} onChange={(e) => setRole(i, e.target.value as Role)}>
                {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <button type="button" className="btn small" onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy || files.length === 0}>{busy ? "Reading documents…" : "Analyse"}</button>
        {busy && <span className="progress muted"><span className="spin" aria-hidden="true" /> About 30–90 seconds. Muse Spark is reading each file.</span>}
      </div>
    </form>
  );
}

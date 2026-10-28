import { useEffect, useState } from "react";
import { Report } from "./Report";
import { Upload } from "./Upload";
import { RulePacks } from "./RulePacks";
import type { Loaded } from "./types";

type DemoEntry = { id: string; title: string; trap: string; verdict: string; jurisdiction: string };
type Sample = { set: string; id: string; company: string; jurisdiction: string; trap: string };
const JN: Record<string, string> = { JE: "Jersey", SG: "Singapore" };

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("sp-theme") ?? "system"; } catch { return "system"; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try { localStorage.setItem("sp-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme] as const;
}

export function App() {
  const [theme, setTheme] = useTheme();
  const [live, setLive] = useState<{ live: boolean; model: string | null } | null>(null);
  const [demos, setDemos] = useState<DemoEntry[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "packs">("home");
  const [usePack, setUsePack] = useState(false);

  useEffect(() => {
    fetch("demo/index.json").then((r) => (r.ok ? r.json() : [])).then(setDemos).catch(() => setDemos([]));
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        setLive(h);
        if (h?.live) fetch("/api/samples").then((r) => r.json()).then(setSamples);
      })
      .catch(() => setLive(null));
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [loaded]);

  async function openDemo(id: string) {
    setError("");
    const r = await fetch(`demo/${id}/result.json`);
    if (!r.ok) return setError("Could not load that recorded run.");
    setLoaded({ result: await r.json(), fileBase: `demo/${id}/files/` });
  }

  async function runSample(s: Sample) {
    setError("");
    setBusy(`${s.set}:${s.id}`);
    try {
      const r = await fetch("/api/analyze-sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: s.set, id: s.id, usePack }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLoaded(j);
    } catch (e: any) {
      setError(e.message ?? "Analysis failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="top">
        <div className="container bar">
          <a className="brand" href="./" onClick={(e) => { e.preventDefault(); setLoaded(null); }}><span className="mark">SP</span>Substance Proof</a>
          <span className="badge">{live?.live ? `Live · ${live.model}` : "Recorded runs"}</span>
          <span className="spacer" />
          <label className="muted" style={{ fontSize: "var(--step--1)" }}>
            Theme{" "}
            <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ minHeight: "2.25rem", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }}>
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      <main id="main" className="container">
        {loaded ? (
          <Report loaded={loaded} onBack={() => setLoaded(null)} />
        ) : view === "packs" ? (
          <RulePacks live={!!live?.live} onBack={() => setView("home")} />
        ) : (
          <div className="stack" style={{ ["--gap" as any]: "2rem" }}>
            <section className="stack" style={{ ["--gap" as any]: ".75rem", maxWidth: "52rem" }}>
              <h1>The minutes say the board met in Jersey. Did it?</h1>
              <p className="muted" style={{ fontSize: "var(--step-1)" }}>
                Economic-substance and tax-residence rules require directors to be physically present where the board meets.
                Substance Proof reads the meeting pack (minutes, boarding passes, hotel bills, the recording) with Meta's Muse models,
                then tested code applies the published rule and cites the page or second behind every finding.
              </p>
              <ol className="stats" style={{ paddingInlineStart: "1.1rem" }}>
                <li><b>Read</b>: Muse Spark and Muse Voice Transcribe extract who was where, and when.</li>
                <li><b>Decide</b>: a rules engine, not the AI, applies the law.</li>
                <li><b>Act</b>: an agent drafts evidence requests; you approve.</li>
              </ol>
            </section>

            {error && <p className="error" role="alert">{error}</p>}

            <section className="card row" style={{ justifyContent: "space-between", alignItems: "center" }} aria-labelledby="packs-h">
              <div className="stack" style={{ ["--gap" as any]: ".25rem", flex: "1 1 30rem" }}>
                <h2 id="packs-h">Add a jurisdiction by giving it the law</h2>
                <p className="muted" style={{ fontSize: "var(--step--1)" }}>Muse Spark reads a full statute or official guidance and writes the rules as data, quoting the law for each one. Code verifies every quote; a person approves.</p>
              </div>
              <button className="btn primary" onClick={() => setView("packs")}>See the rules it wrote</button>
            </section>

            <div className="grid-2">
              <section className="card stack" aria-labelledby="rec-h">
                <h2 id="rec-h">See a finished check (instant)</h2>
                <p className="muted" style={{ fontSize: "var(--step--1)" }}>Real outputs from Meta's models on synthetic meeting packs, saved so anyone can explore them without an API key. All people and companies are fictional.</p>
                <div className="samples">
                  {demos.length === 0 && <p className="note">No recorded runs found.</p>}
                  {demos.map((d, i) => (
                    <div key={d.id} className={`sample${i === 0 ? " hero" : ""}`}>
                      <strong>{d.title}</strong>
                      <button className="btn small primary" onClick={() => openDemo(d.id)} aria-label={`Open recorded run ${d.title}`}>{i === 0 ? "Start here" : "Open"}</button>
                      <p>{JN[d.jurisdiction]} · {d.verdict} · {d.trap.replace(/^HERO: /, "")}</p>
                    </div>
                  ))}
                </div>
              </section>

              {live?.live ? (
                <section className="card stack" aria-labelledby="live-h">
                  <h2 id="live-h">Run a check now (live, about 1 minute)</h2>
                  <p className="muted" style={{ fontSize: "var(--step--1)" }}>Calls Muse Spark, Voice Transcribe and the agent now. Usually 30–90 seconds and a few cents of credit.</p>
                  <label style={{ fontSize: "var(--step--1)" }}>
                    <input type="checkbox" checked={usePack} onChange={(e) => setUsePack(e.target.checked)} /> Decide with the rules Muse Spark wrote from the law (instead of the hand-written rules)
                  </label>
                  <div className="samples" style={{ maxHeight: "28rem", overflow: "auto" }}>
                    {samples.map((s) => (
                      <div key={`${s.set}:${s.id}`} className="sample">
                        <strong>{s.id} · {s.company}</strong>
                        <button className="btn small" disabled={!!busy} onClick={() => runSample(s)}>{busy === `${s.set}:${s.id}` ? "Running…" : "Analyse"}</button>
                        <p>{JN[s.jurisdiction]} · {s.set === "test" ? "held-out test set" : s.trap}</p>
                      </div>
                    ))}
                  </div>
                  {busy && <p className="progress muted"><span className="spin" aria-hidden="true" /> Reading documents with Muse Spark…</p>}
                </section>
              ) : (
                <section className="card stack">
                  <h2>Run it live</h2>
                  <p>Live analysis runs on your own computer with your own Meta API key, which is never put in the browser. See the README: <span className="mono">npm install</span>, add your key to <span className="mono">.env</span>, then <span className="mono">npm run app</span>.</p>
                </section>
              )}
            </div>

            {live?.live && <Upload onLoaded={setLoaded} />}
          </div>
        )}
      </main>

      <footer className="foot">
        <div className="container">
          <p>Information and calculation from published rules (Jersey Taxation (Companies – Economic Substance) Law 2019, Art. 5; IRAS guidance on control and management). Not legal or tax advice. Demo data is synthetic.</p>
        </div>
      </footer>
    </>
  );
}

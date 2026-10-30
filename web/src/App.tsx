import { useEffect, useState } from "react";
import { Report } from "./Report";
import { Upload } from "./Upload";
import { RulePacks } from "./RulePacks";
import { ProofStrip } from "./ProofStrip";
import { EvidenceDesk } from "./EvidenceDesk";
import type { Loaded } from "./types";
import { Icon, StatusIcon } from "./Icon";
import { Logo } from "./Logo";

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
          <a className="brand" href="./" onClick={(e) => { e.preventDefault(); setLoaded(null); }}><Logo />Substance Proof</a>
          <span className="badge">{live?.live ? `Live · ${live.model}` : "Recorded runs"}</span>
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Colour theme">
            {(["system", "light", "dark"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={theme === v} onClick={() => setTheme(v)}>{v === "system" ? "Auto" : v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
      </header>

      <main id="main" className="container">
        {loaded ? (
          <Report loaded={loaded} onBack={() => setLoaded(null)} />
        ) : view === "packs" ? (
          <RulePacks live={!!live?.live} onBack={() => setView("home")} />
        ) : (
          <div className="home stack" style={{ ["--gap" as any]: "2rem" }}>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">Board-meeting evidence check · Jersey and Singapore</p>
                <h1 className="home-h1">The minutes say the board met in Jersey. <span>Did it?</span></h1>
                <p className="deck">
                  Substance Proof reads the meeting pack with Meta's Muse models. Tested code, not the model, applies the published rule, and every finding points to the page or second it came from.
                </p>
                <div className="hero-actions">
                  <button className="btn primary big" onClick={() => openDemo("m11")}>Open the case</button>
                  <a className="link-arrow" href="#how">How it decides <Icon name="arrow-down" /></a>
                </div>
                <dl className="proofs">
                  <div><dt>Facts read exactly</dt><dd>165/166</dd></div>
                  <div><dt>Meeting verdicts</dt><dd>30/30</dd></div>
                  <div><dt>Dangerous errors</dt><dd>0</dd></div>
                </dl>
                <p className="proofs-note">Held-out test set: 30 synthetic meetings, 110 files, never used for tuning.</p>
              </div>
              <EvidenceDesk />
            </section>

            <ProofStrip id="m11" onOpen={() => openDemo("m11")} />

            <section className="how" id="how" aria-labelledby="how-h">
              <h2 id="how-h">The model reads.<br />Code decides.<br /><span>A person approves.</span></h2>
              <ol className="how-steps">
                <li><span className="n">01</span><div><h3>Read</h3><p>Muse Spark reads every PDF and photo; Muse Voice Transcribe turns the recording into a timed roll-call. Each fact comes back with the exact words it was read from.</p><p className="tool">Muse Spark 1.3 · Muse Voice Transcribe</p></div></li>
                <li><span className="n">02</span><div><h3>Decide</h3><p>Deterministic, unit-tested code converts time zones, matches names, places each director, and applies the published rule. The model never decides a test.</p><p className="tool">79 tests · Jersey Art. 5(3) · IRAS guidance</p></div></li>
                <li><span className="n">03</span><div><h3>Approve</h3><p>A Muse Spark agent drafts evidence requests and minutes corrections through function tools. Code checks every call, and nothing is sent without a person.</p><p className="tool">Function calling · guardrails · human approval</p></div></li>
              </ol>
            </section>


            {error && <p className="error" role="alert">{error}</p>}

            <div className="grid-2">
              <section className="card stack" aria-labelledby="rec-h">
                <h2 id="rec-h">See a finished check (instant)</h2>
                <p className="muted" style={{ fontSize: "var(--step--1)" }}>Real outputs from Meta's models on synthetic meeting packs, saved so anyone can explore them without an API key. All people and companies are fictional.</p>
                <div className="samples">
                  {demos.length === 0 && <p className="note">No recorded runs found.</p>}
                  {demos.map((d, i) => (
                    <div key={d.id} className={`sample${i === 0 ? " hero" : ""}`}>
                      <strong><span className={`tag ${d.verdict}`}><StatusIcon s={d.verdict} /> {d.verdict}</span> {d.trap.replace(/^HERO: /, "")}</strong>
                      <button className="btn small primary" onClick={() => openDemo(d.id)} aria-label={`Open recorded run ${d.title}`}>{i === 0 ? "Start here" : "Open"}</button>
                      <p>{d.title} · {JN[d.jurisdiction]}</p>
                    </div>
                  ))}
                </div>
              </section>

              {live?.live ? (
                <section className="card stack" aria-labelledby="live-h">
                  <h2 id="live-h">Run a check now (live, about 1 minute)</h2>
                  <p className="muted" style={{ fontSize: "var(--step--1)" }}>Calls Muse Spark, Voice Transcribe and the agent now. Usually 30–90 seconds and a few cents of credit.</p>
                  <label style={{ fontSize: "var(--step--1)", display: "flex", gap: ".5rem", alignItems: "start" }}>
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

            <section className="card row" style={{ justifyContent: "space-between", alignItems: "center" }} aria-labelledby="packs-h">
              <div className="stack" style={{ ["--gap" as any]: ".25rem", flex: "1 1 30rem" }}>
                <h2 id="packs-h">Add a jurisdiction by giving it the law</h2>
                <p className="muted" style={{ fontSize: "var(--step--1)" }}>Muse Spark reads a full statute or official guidance and writes the rules as data, quoting the law for each one. Code verifies every quote; a person approves.</p>
              </div>
              <button className="btn" onClick={() => setView("packs")}>See the rules it wrote</button>
            </section>

            {live?.live && (
              <details className="card">
                <summary>Analyse your own meeting pack</summary>
                <div style={{ marginTop: "1rem" }}><Upload onLoaded={setLoaded} /></div>
              </details>
            )}
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

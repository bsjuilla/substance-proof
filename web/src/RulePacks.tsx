import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// "Add a jurisdiction by giving it the law": Muse Spark reads the full official text and drafts a rule pack;
// code checks every quote word for word; a person approves. Shows recorded packs and (live mode) a builder.

type Test = { id: string; label: string; kind: string; applies_to: string; threshold: number | null; chair_alternative: boolean; count: string; basis: string; citation: string; quote: string; quoteFound?: boolean; problems?: string[] };
type Built = {
  pack: { jurisdiction_code: string; jurisdiction_name: string; source_title: string; not_supported: { requirement: string; quote: string }[] };
  validated: Test[];
  approvedTests: Test[];
  model?: string; inputTokens?: number; seconds?: number; costUsd?: number; sourceUrl?: string; sourceChars?: number;
};
type Index = { agreement: string; perRun: string[]; packs: { code: string; name: string; source: string; sourceUrl: string; sourceChars: number; inputTokens: number; seconds: number; costUsd: number; proposed: number; approved: number; notSupported: number }[] };

const KIND: Record<string, string> = {
  quorum_physically_present: "Quorum physically present",
  majority_physically_present: "Majority physically present",
  share_physically_present_or_chair: "Share of directors physically present, or the chair",
  venue_in_jurisdiction: "Meeting held in the jurisdiction",
  minutes_record_strategic_decisions: "Minutes record strategic decisions",
  records_kept_in_jurisdiction: "Records kept in the jurisdiction",
  sole_director_physically_present: "Sole director physically present",
};

export function PackView({ built, approvable }: { built: Built; approvable?: boolean }) {
  const [approved, setApproved] = useState(false);
  const passed = built.validated.filter((t) => !t.problems?.length).length;
  return (
    <div className="stack" style={{ ["--gap" as any]: "1.25rem" }}>
      <ol className="flow" aria-label="How this pack was made">
        {built.sourceChars != null && <li><b>{built.sourceChars.toLocaleString()}</b> characters of official text</li>}
        {built.inputTokens != null && <li><b>{built.inputTokens.toLocaleString()}</b> tokens read by Muse Spark in {built.seconds}s{built.costUsd != null ? ` · $${built.costUsd.toFixed(3)}` : ""}</li>}
        <li><b>{built.validated.length}</b> rule{built.validated.length === 1 ? "" : "s"} proposed</li>
        <li><b>{passed}/{built.validated.length}</b> quotes found word for word{built.pack.not_supported.length ? ` · ${built.pack.not_supported.length} marked not checkable` : ""}</li>
        <li><b>A person</b> approves before use</li>
      </ol>
      {built.sourceUrl && <p className="small muted">Official source: <a href={built.sourceUrl} target="_blank" rel="noreferrer">{built.sourceUrl}</a></p>}
      <ol className="pairs">
        {built.validated.map((t) => {
          const ok = !t.problems?.length;
          return (
            <li key={t.id} className={ok ? "" : "rejected"}>
              <div className="law">
                <span className="sec-num"><span>{t.citation}</span> the law says</span>
                <q>{t.quote}</q>
              </div>
              <div className="rule">
                <span className="sec-num">the rule it became</span>
                <b>{KIND[t.kind] ?? t.kind}</b>
                <span className="small muted">
                  Applies to {t.applies_to.replace(/_/g, " ")} · counts {t.count.replace(/_/g, " ")}
                  {t.threshold != null ? ` · at least ${Math.round(t.threshold * 100)}%` : ""}{t.chair_alternative ? " · or the chair" : ""} · basis: {t.basis}
                </span>
                <span className={`small ${ok ? "st pass" : "st fail"}`}>
                  {ok ? <><Icon name="check" /> Quote verified, parameters valid</> : <><Icon name="cross" /> Rejected by code: {t.problems?.join("; ")}</>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {built.pack.not_supported.length > 0 && (
        <div className="not-checkable">
          <p className="sec-num"><span>{built.pack.not_supported.length}</span> found in the text but not checkable from travel evidence, listed rather than dropped</p>
          <ul>{built.pack.not_supported.map((n, i) => <li key={i}>{n.requirement}</li>)}</ul>
        </div>
      )}
      {approvable && (
        <div className="actions no-print">
          {approved ? <span className="st pass"><Icon name="check" /> Approved for this session (a person reviewed every rule above)</span>
            : <button className="btn primary" onClick={() => setApproved(true)} disabled={built.approvedTests.length === 0}>Approve {built.approvedTests.length} rule{built.approvedTests.length === 1 ? "" : "s"}</button>}
        </div>
      )}
    </div>
  );
}

export function RulePacks({ live, onBack }: { live: boolean; onBack: () => void }) {
  const [index, setIndex] = useState<Index | null>(null);
  const [open, setOpen] = useState<Built | null>(null);
  const [code, setCode] = useState("JE");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Built | null>(null);

  useEffect(() => {
    fetch("rulepacks/index.json").then((r) => (r.ok ? r.json() : null)).then(setIndex).catch(() => setIndex(null));
    show("JE");
  }, []);

  async function show(c: string) {
    setCode(c);
    const r = await fetch(`rulepacks/${c}.json`);
    if (r.ok) setOpen(await r.json());
  }

  async function build(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setFresh(null);
    try {
      const r = await fetch("/api/build-pack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setFresh(j);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="packs stack" style={{ ["--gap" as any]: "1.75rem" }}>
      <div><button className="btn small" onClick={onBack}><Icon name="arrow-right" className="flip" /> Back</button></div>
      <section className="packs-head">
        <div className="stack" style={{ ["--gap" as any]: ".9rem" }}>
          <p className="eyebrow">Add a jurisdiction by giving it the law</p>
          <h1 className="report-h1">Muse Spark wrote the rules from the statute.</h1>
          <p className="deck">
            It reads the whole official text and drafts each presence rule as data, quoting the exact words behind it. Code checks every quote against the source word for word and refuses anything the engine cannot compute. A person approves the pack before it is used.
          </p>
        </div>
        {index && (
          <div className="big-stat">
            <span className="n">{index.agreement}</span>
            <span>meetings got the same law-level verdict with the AI-written rules as with the hand-written ones</span>
            <span className="small muted">{index.perRun.length} independent runs: {index.perRun.join(" · ")}</span>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="Rule packs">
        <div className="seg" role="tablist" aria-label="Jurisdiction">
          {index?.packs.map((p) => (
            <button key={p.code} role="tab" aria-selected={code === p.code} aria-pressed={code === p.code} onClick={() => show(p.code)}>
              {p.name} · {p.approved}/{p.proposed} rule{p.proposed === 1 ? "" : "s"}
            </button>
          ))}
        </div>
        {open && (
          <div className="stack">
            <h2>{open.pack.source_title}</h2>
            <PackView built={open} />
          </div>
        )}
      </section>

      {live ? (
        <form className="card stack" onSubmit={build}>
          <p className="sec-num"><span>Live</span> runs Muse Spark now with your key</p>
          <h2>Write a rule pack from any law</h2>
          <p className="muted" style={{ fontSize: "var(--step--1)" }}>Paste the full text of a substance law or tax-residence guidance (for example Guernsey's or the Isle of Man's). Live call to Muse Spark; usually under a minute and a few cents.</p>
          <div className="field"><label htmlFor="pt">Source title</label><input id="pt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Income Tax (Substance Requirements) Regulations 2018" /></div>
          <div className="field"><label htmlFor="px">Full text</label><textarea id="px" value={text} onChange={(e) => setText(e.target.value)} rows={10} style={{ padding: ".5rem", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", background: "var(--surface)" }} /></div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button className="btn primary" disabled={busy || text.length < 200}>{busy ? "Muse Spark is reading the law…" : "Write rule pack"}</button>
            {busy && <span className="progress muted"><span className="spin" aria-hidden="true" /> Reading the whole text</span>}
          </div>
          {fresh && <PackView built={fresh} approvable />}
        </form>
      ) : (
        <p className="note">Writing a new pack runs live with your own Meta API key on your computer (see the README).</p>
      )}
    </div>
  );
}

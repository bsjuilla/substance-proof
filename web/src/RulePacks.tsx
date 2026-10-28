import { useEffect, useState } from "react";

// "Add a jurisdiction by giving it the law": Muse Spark reads the full official text and drafts a rule pack;
// code checks every quote word for word; a person approves. Shows recorded packs and (live mode) a builder.

type Test = { id: string; label: string; kind: string; applies_to: string; threshold: number | null; chair_alternative: boolean; count: string; basis: string; citation: string; quote: string; quoteFound?: boolean; problems?: string[] };
type Built = {
  pack: { jurisdiction_code: string; jurisdiction_name: string; source_title: string; not_supported: { requirement: string; quote: string }[] };
  validated: Test[];
  approvedTests: Test[];
  model?: string; inputTokens?: number; seconds?: number; costUsd?: number; sourceUrl?: string; sourceChars?: number;
};
type Index = { agreement: string; packs: { code: string; name: string; source: string; sourceUrl: string; sourceChars: number; inputTokens: number; seconds: number; costUsd: number; proposed: number; approved: number; notSupported: number }[] };

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
  return (
    <div className="stack">
      <p className="stats">
        <span><b>{built.pack.jurisdiction_name}</b> · {built.pack.source_title}</span>
        {built.sourceChars != null && <span><b>{built.sourceChars.toLocaleString()}</b> characters of source</span>}
        {built.inputTokens != null && <span>Muse Spark read <b>{built.inputTokens.toLocaleString()}</b> tokens in <b>{built.seconds}s</b> (${built.costUsd?.toFixed(3)})</span>}
      </p>
      {built.sourceUrl && <p style={{ fontSize: "var(--step--1)" }}>Official source: <a href={built.sourceUrl} target="_blank" rel="noreferrer">{built.sourceUrl}</a></p>}
      {built.validated.map((t) => {
        const ok = !t.problems?.length;
        return (
          <article key={t.id} className="draft" style={{ borderLeftColor: ok ? "var(--ok)" : "var(--bad)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{KIND[t.kind] ?? t.kind}</b>
              <span className="badge law">{t.citation}</span>
            </div>
            <p className="muted" style={{ fontSize: "var(--step--1)", marginTop: ".25rem" }}>
              Applies to {t.applies_to.replace(/_/g, " ")} · counts {t.count.replace(/_/g, " ")}
              {t.threshold != null ? ` · at least ${Math.round(t.threshold * 100)}%` : ""}{t.chair_alternative ? " · or the chair" : ""} · basis: {t.basis}
            </p>
            <blockquote style={{ margin: ".5rem 0", padding: ".5rem .75rem", borderLeft: "3px solid var(--border-strong)", background: "var(--surface-2)", fontFamily: "var(--font-serif)" }}>“{t.quote}”</blockquote>
            <p className={ok ? "st pass" : "st fail"} style={{ fontSize: "var(--step--1)" }}>
              {ok ? "✓ Quote found word for word in the official text · parameters valid" : `✕ Rejected by code: ${t.problems?.join("; ")}`}
            </p>
          </article>
        );
      })}
      {built.pack.not_supported.length > 0 && (
        <details>
          <summary>Found in the text but not checkable by this engine ({built.pack.not_supported.length})</summary>
          <ul style={{ marginTop: ".5rem" }}>{built.pack.not_supported.map((n, i) => <li key={i}>{n.requirement}</li>)}</ul>
        </details>
      )}
      {approvable && (
        <div className="actions no-print">
          {approved ? <span className="st pass">✓ Approved for this session (a person reviewed every rule above)</span>
            : <button className="btn primary small" onClick={() => setApproved(true)} disabled={built.approvedTests.length === 0}>Approve {built.approvedTests.length} rule(s)</button>}
        </div>
      )}
    </div>
  );
}

export function RulePacks({ live, onBack }: { live: boolean; onBack: () => void }) {
  const [index, setIndex] = useState<Index | null>(null);
  const [open, setOpen] = useState<Built | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Built | null>(null);

  useEffect(() => {
    fetch("rulepacks/index.json").then((r) => (r.ok ? r.json() : null)).then(setIndex).catch(() => setIndex(null));
  }, []);

  async function show(code: string) {
    const r = await fetch(`rulepacks/${code}.json`);
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
    <div className="stack" style={{ ["--gap" as any]: "1.5rem" }}>
      <div><button className="btn small" onClick={onBack}>← Back</button></div>
      <section className="stack" style={{ maxWidth: "52rem" }}>
        <h1>Rules written by Muse Spark from the law</h1>
        <p className="muted" style={{ fontSize: "var(--step-1)" }}>
          Give Muse Spark the full text of a law or official guidance. It reads all of it and drafts the presence rules as data, quoting the exact words behind each one.
          Code then checks every quote against the source word for word and rejects anything the engine cannot compute. A person approves the pack before it is used.
        </p>
        {index && <p className="note">On all {index.agreement.split("/")[1]} dev and held-out meetings, the packs Muse Spark wrote from the raw Jersey statute and the IRAS guidance reached the same law-level verdicts as the hand-written rules: <b>{index.agreement}</b>.</p>}
      </section>

      <div className="grid-2">
        {index?.packs.map((p) => (
          <section key={p.code} className="card stack">
            <h2>{p.name}</h2>
            <p className="muted" style={{ fontSize: "var(--step--1)" }}>{p.source}</p>
            <p className="stats"><span><b>{p.approved}</b>/{p.proposed} rules passed the checks</span><span><b>{p.notSupported}</b> flagged as not checkable</span><span>{p.inputTokens.toLocaleString()} tokens · {p.seconds}s</span></p>
            <div><button className="btn small primary" onClick={() => show(p.code)}>View rules and quotes</button></div>
          </section>
        ))}
      </div>
      {open && <section className="card stack"><h2>{open.pack.jurisdiction_name}: proposed rules</h2><PackView built={open} /></section>}

      {live ? (
        <form className="card stack" onSubmit={build}>
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

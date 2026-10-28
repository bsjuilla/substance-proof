import { useState } from "react";
import { Timeline } from "./Timeline";
import { Viewer } from "./Viewer";
import type { Citation, Draft, Loaded, TestResult } from "./types";

const NAMES: Record<string, string> = { JE: "Jersey", SG: "Singapore" };
const STATUS_TEXT: Record<TestResult["status"], string> = { pass: "✓ Met", fail: "✕ Not met", inconclusive: "? Unproven", not_applicable: "– N/A" };
const BASIS_TEXT: Record<TestResult["basis"], string> = { law: "Law", regulator: "Regulator", guidance: "Guidance (switchable)" };

function headline(r: Loaded["result"]): string {
  const ev = r.evaluation;
  const failedLaw = ev.tests.find((t) => t.status === "fail" && (t.basis === "law" || t.basis === "regulator"));
  if (ev.verdict === "FAIL" && failedLaw) return `${failedLaw.label}: not met. ${failedLaw.detail}`;
  const parts: string[] = [];
  const regulatorFails = ev.tests.filter((t) => t.status === "fail" && t.basis === "regulator").map((t) => t.label);
  if (regulatorFails.length) parts.push(`regulator guidance indicator not met: ${regulatorFails.join("; ")}`);
  const unproven = ev.tests.filter((t) => t.status === "inconclusive").map((t) => t.label.toLowerCase());
  const guidanceFails = ev.tests.filter((t) => t.status === "fail" && t.basis === "guidance").map((t) => t.label.toLowerCase());
  if (ev.contradictions.length) parts.push(`${ev.contradictions.length} director${ev.contradictions.length > 1 ? "s'" : "'s"} location in the minutes conflicts with the evidence`);
  if (unproven.length) parts.push(`unproven: ${unproven.join("; ")}`);
  if (guidanceFails.length) parts.push(`guidance-level test not met: ${guidanceFails.join("; ")}`);
  if (ev.verdict === "PASS") return "Every rule test is met by independent evidence, and the minutes match it.";
  return parts.join(". ") + ".";
}

export function Report({ loaded, onBack }: { loaded: Loaded; onBack: () => void }) {
  const { result, fileBase } = loaded;
  const [cite, setCite] = useState<Citation | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "declined">>({});
  const ev = result.evaluation;
  const decide = (d: Draft, v: "approved" | "declined") => setDecisions((s) => ({ ...s, [d.id]: v }));

  return (
    <div className="stack" style={{ ["--gap" as any]: "1.5rem" }}>
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <button className="btn small" onClick={onBack}>← All meetings</button>
        <div className="actions">
          <span className="badge">{result.mode === "replay" ? "Recorded live run" : "Live run"} · {result.model}</span>
          {result.rulePack && <span className="badge law">Rules written by Muse Spark from: {result.rulePack.source}</span>}
          <button className="btn small" onClick={() => window.print()}>Print evidence memo</button>
        </div>
      </div>

      <div className="print-only">
        <p><b>Substance Proof — evidence memo.</b> Information and calculation from published rules; not legal or tax advice. Generated {new Date(result.createdAt).toUTCString()}.</p>
      </div>

      <section className="stack" aria-labelledby="co-h">
        <p className="muted" style={{ fontSize: "var(--step--1)" }}>{NAMES[result.jurisdiction]} · board meeting of {result.meetingDateText} · {result.meeting.mode.replace("_", " ")}{result.meeting.isStrategic ? " · strategic decisions taken" : ""}</p>
        <h1 id="co-h">{result.company.name}</h1>
        <div className={`verdict ${ev.verdict}`} role="status">
          <span className="word">{ev.verdict === "FAIL" ? "✕ FAIL" : ev.verdict === "REVIEW" ? "? REVIEW" : "✓ PASS"}</span>
          <p><b>{ev.verdict === "FAIL" ? "The evidence does not show a test in the law being met." : ev.verdict === "REVIEW" ? "Needs a person to review before relying on these minutes." : "Presence tests met."}</b></p>
          <p>{headline(result)}</p>
        </div>
        <div className="stats">
          <span><b>{result.docs.length}</b> files read</span>
          <span><b>{result.facts.length}</b> facts extracted, each with a citation</span>
          <span><b>{ev.contradictions.length}</b> contradiction{ev.contradictions.length === 1 ? "" : "s"}</span>
          <span><b>{result.seconds}s</b> · <b>${result.costUsd.toFixed(3)}</b> of Meta API credit</span>
        </div>
      </section>

      <Timeline result={result} onCite={setCite} />

      <div className="grid-2">
        <section className="card stack" aria-labelledby="rules-h">
          <h2 id="rules-h">Rule tests</h2>
          <p className="muted" style={{ fontSize: "var(--step--1)" }}>Decided by tested code from the published rules. The AI only reads documents; it never decides a test.</p>
          <div style={{ overflowX: "auto" }}>
            <table className="tests">
              <thead><tr><th scope="col">Result</th><th scope="col">Test</th><th scope="col">Basis</th></tr></thead>
              <tbody>
                {ev.tests.map((t) => (
                  <tr key={t.id}>
                    <td className={`st ${t.status}`}>{STATUS_TEXT[t.status]}</td>
                    <td><b>{t.label}</b><br /><span className="muted">{t.detail}</span><br /><span className="mono muted" style={{ fontSize: ".75rem" }}>{t.citation}</span></td>
                    <td><span className={`badge ${t.basis === "law" || t.basis === "regulator" ? "law" : "guidance"}`}>{BASIS_TEXT[t.basis]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack" aria-labelledby="agent-h">
          <h2 id="agent-h">Drafted by the evidence agent</h2>
          <p className="muted" style={{ fontSize: "var(--step--1)" }}>
            Muse Spark used tools to look at the gaps and draft these. Every tool call was checked by code. Nothing is sent: each draft waits for your decision.
          </p>
          {!result.agent && <p className="note">The agent was not run for this meeting.</p>}
          {result.agent && result.agent.drafts.length === 0 && <p className="note">No gaps or contradictions: nothing to request.</p>}
          {result.agent?.drafts.map((d) => {
            const state = decisions[d.id];
            return (
              <article key={d.id} className={`draft ${state ?? ""}`} aria-label={`${d.kind === "evidence_request" ? "Evidence request" : "Minutes correction"} for ${d.directorName}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="badge">{d.kind === "evidence_request" ? "Evidence request" : "Minutes correction"} · {d.directorName}</span>
                  <span className="muted" style={{ fontSize: "var(--step--1)" }}>{state === "approved" ? "Approved (demo: not actually sent)" : state === "declined" ? "Declined" : "Awaiting approval"}</span>
                </div>
                <p style={{ marginTop: ".5rem" }}><b>{d.subject}</b></p>
                <pre>{d.message}</pre>
                <div className="actions">
                  {d.citations.map((c) => {
                    const [docId, tag] = c.split(/[@#]/);
                    const ts = c.includes("@") ? parseFloat(tag) : undefined;
                    const page = c.includes("#p") ? parseInt(tag.slice(1)) : undefined;
                    return <button key={c} className="chip" onClick={() => setCite({ docId, timestampSec: ts, page })}>{c.split("/").pop()}</button>;
                  })}
                </div>
                {!state && (
                  <div className="actions no-print" style={{ marginTop: ".75rem" }}>
                    <button className="btn small primary" onClick={() => decide(d, "approved")}>Approve</button>
                    <button className="btn small" onClick={() => decide(d, "declined")}>Decline</button>
                  </div>
                )}
              </article>
            );
          })}
          {result.agent && (
            <details className="no-print">
              <summary>Show the agent's tool calls ({result.agent.trace.length}{result.agent.rejectedCalls ? `, ${result.agent.rejectedCalls} rejected by the guardrails` : ""})</summary>
              <div className="trace">{result.agent.trace.map((t) => `#${t.step} ${t.tool}(${JSON.stringify(t.args)})\n→ ${JSON.stringify(t.result)}`).join("\n\n")}</div>
            </details>
          )}
        </section>
      </div>

      {result.rejected.length > 0 && (
        <section className="card stack">
          <h2>Not used</h2>
          <p className="muted">Things the extractor read that the code refused, rather than guess:</p>
          <ul>{result.rejected.map((r, i) => <li key={i}><span className="mono">{r.file}</span>: {r.reason}</li>)}</ul>
        </section>
      )}

      <Viewer cite={cite} result={result} fileBase={fileBase} onClose={() => setCite(null)} />
    </div>
  );
}

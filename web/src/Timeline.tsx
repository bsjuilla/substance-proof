import { jurisdictionOf, JURISDICTION_NAMES, placeName } from "../../src/engine/gazetteer";
import type { Citation, Fact } from "../../src/engine/types";
import type { RunResult } from "./types";

const ZONE: Record<string, string> = { JE: "Europe/Jersey", SG: "Asia/Singapore" };
const W = 1000;
const H = 64;

type Props = { result: RunResult; onCite: (c: Citation) => void };

export function Timeline({ result, onCite }: Props) {
  const { evaluation, meeting, facts, company, jurisdiction } = result;
  const S = Date.parse(meeting.startUtc);
  const E = Date.parse(meeting.endUtc);
  const pad = 6 * 3600_000;
  const t0 = S - pad;
  const t1 = E + pad;
  const x = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * W;
  const zone = ZONE[jurisdiction];
  const hm = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(t));
  const zoneName = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date(S)).find((p) => p.type === "timeZoneName")?.value;
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / 7200_000) * 7200_000; t <= t1; t += 7200_000) ticks.push(t);
  const target = JURISDICTION_NAMES[jurisdiction];

  return (
    <section className="card stack" aria-labelledby="tl-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="tl-h">Where was each director?</h2>
        <span className="muted" style={{ fontSize: "var(--step--1)" }}>
          Meeting {hm(S)}–{hm(E)} {zoneName}, {result.meetingDateText}. Window shown: 6 hours either side.
        </span>
      </div>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: "var(--ok)" }} />Stay in {target}</span>
        <span><i style={{ background: "var(--warn)" }} />Stay elsewhere</span>
        <span><i style={{ background: "repeating-linear-gradient(45deg,var(--flight) 0 3px,transparent 3px 6px)", border: "1px solid var(--flight)" }} />In flight</span>
        <span><i style={{ background: "var(--meeting)", border: "1px solid var(--accent)" }} />Meeting</span>
        <span>■ minutes claim · ● recording claim</span>
      </div>
      <div>
        {company.directors
          .filter((d) => meeting.attendeeIds.includes(d.id))
          .map((d) => {
            const p = evaluation.presence.find((q) => q.directorId === d.id);
            const mine = facts.filter((f) => f.directorId === d.id);
            const status = p?.status ?? "unknown";
            const label = status === "present" ? `Present in ${target}` : status === "absent" ? "Not in " + target : "Unproven";
            const claimPlace = (f: Extract<Fact, { kind: "claimed_location" }>) => JURISDICTION_NAMES[jurisdictionOf(f.placeCode) ?? ""] ?? f.placeCode;
            return (
              <div className="lane" key={d.id}>
                <div className="who">
                  <strong>{d.name}{d.isChair ? " (Chair)" : ""}</strong>
                  <span className={`pill ${status}`}>{status === "present" ? "✓" : status === "absent" ? "✕" : "?"} {label}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${d.name}: ${label}. ${p?.reason ?? ""}`} style={{ width: "100%", minWidth: 560, height: "auto" }}>
                  <defs>
                    <pattern id={`hatch-${d.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="3" height="6" style={{ fill: "var(--flight)" }} />
                    </pattern>
                  </defs>
                  <rect x={x(S)} y={0} width={Math.max(2, x(E) - x(S))} height={H} style={{ fill: "var(--meeting)", stroke: "var(--accent)", strokeDasharray: "4 3" }} />
                  {ticks.map((t) => (
                    <line key={t} x1={x(t)} x2={x(t)} y1={H - 8} y2={H} style={{ stroke: "var(--border-strong)" }} />
                  ))}
                  {mine.map((f, i) => {
                    if (f.kind === "hotel_stay") {
                      const inT = jurisdictionOf(f.placeCode) === jurisdiction;
                      const a = Date.parse(f.checkInUtc), b = Date.parse(f.checkOutUtc);
                      return (
                        <g key={i} onClick={() => onCite(f.cite)} style={{ cursor: "pointer" }}>
                          <title>Hotel stay in {placeName(f.placeCode)} (click to open)</title>
                          <rect x={x(a)} y={20} width={Math.max(3, x(b) - x(a))} height={22} rx={3} style={{ fill: inT ? "var(--ok)" : "var(--warn)", opacity: 0.9 }} />
                          <text x={x(a) + 8} y={35} style={{ fill: inT ? "var(--on-ok)" : "var(--on-warn)", fontSize: 12, fontWeight: 600 }}>{placeName(f.placeCode)}</text>
                        </g>
                      );
                    }
                    if (f.kind === "flight_leg") {
                      const a = Date.parse(f.departUtc), b = Date.parse(f.arriveUtc);
                      return (
                        <g key={i} onClick={() => onCite(f.cite)} style={{ cursor: "pointer" }}>
                          <title>Flight {f.originCode}→{f.destCode}, {hm(a)}–{hm(b)} {zoneName} (click to open)</title>
                          <rect x={x(a)} y={20} width={Math.max(3, x(b) - x(a))} height={22} style={{ fill: `url(#hatch-${d.id})`, stroke: "var(--flight)" }} />
                          <text x={x(a) + 4} y={16} style={{ fill: "var(--text)", fontSize: 12 }}>{f.originCode}→{f.destCode} {hm(a)}</text>
                        </g>
                      );
                    }
                    const conflict = jurisdictionOf(f.placeCode) !== (p?.status === "present" ? jurisdiction : p?.elsewhere ?? jurisdictionOf(f.placeCode));
                    const y = f.source === "recording" ? 54 : 8;
                    const cx = x(S) + (f.source === "recording" ? 28 : 12);
                    return (
                      <g key={i} onClick={() => onCite(f.cite)} style={{ cursor: "pointer" }}>
                        <title>{f.source === "recording" ? "Recording" : "Minutes"} claim: {claimPlace(f)} — “{f.cite.quote}” (click to open)</title>
                        {f.source === "recording" ? (
                          <circle cx={cx} cy={y} r={6} style={{ fill: conflict ? "var(--bad)" : "var(--accent)" }} />
                        ) : (
                          <rect x={cx - 6} y={y - 6} width={12} height={12} style={{ fill: conflict ? "var(--bad)" : "var(--accent)" }} />
                        )}
                      </g>
                    );
                  })}
                </svg>
                </div>
                <p className="why">
                  {p?.reason}{" "}
                  {p?.contradiction && <span className="contra">Minutes say {p.contradiction.claimed}; evidence says {p.contradiction.evidence}. </span>}
                  {p?.claimConflict && <span className="contra">Minutes say {p.claimConflict.minutes}; the recording says {p.claimConflict.recording}. </span>}
                  {(p?.cites ?? []).concat(p?.claimConflict?.cites ?? []).filter((c, i, a) => a.findIndex((z) => z.docId === c.docId && z.timestampSec === c.timestampSec) === i).map((c, i) => (
                    <button key={i} className="chip" onClick={() => onCite(c)} style={{ marginInlineEnd: ".35rem" }}>
                      {c.docId.split("/").pop()}{c.timestampSec != null ? ` @${c.timestampSec}s` : c.page ? ` p${c.page}` : ""}
                    </button>
                  ))}
                </p>
              </div>
            );
          })}
      </div>
      <div className="row muted" style={{ justifyContent: "space-between", fontSize: "var(--step--1)" }} aria-hidden="true">
        <span>{hm(t0)}</span><span>{hm(S)} meeting starts</span><span>{hm(E)} ends</span><span>{hm(t1)}</span>
      </div>
    </section>
  );
}

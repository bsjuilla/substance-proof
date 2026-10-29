import { jurisdictionOf, JURISDICTION_NAMES, placeName } from "../../src/engine/gazetteer";
import type { Citation, Fact } from "../../src/engine/types";
import type { RunResult } from "./types";
import { StatusIcon } from "./Icon";

const ZONE: Record<string, string> = { JE: "Europe/Jersey", SG: "Asia/Singapore" };

type Props = { result: RunResult; onCite: (c: Citation) => void };
type Claim = Extract<Fact, { kind: "claimed_location" }>;

/** Each director gets rows that put what was CLAIMED (minutes, recording) above what the EVIDENCE shows.
 *  Built from HTML (not a scaled SVG) so text stays readable at every width and every mark is a real button. */
export function Timeline({ result, onCite }: Props) {
  const { evaluation, meeting, facts, company, jurisdiction } = result;
  const S = Date.parse(meeting.startUtc);
  const E = Date.parse(meeting.endUtc);
  const pad = 6 * 3600_000;
  const t0 = S - pad;
  const t1 = E + pad;
  const pct = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * 100;
  const zone = ZONE[jurisdiction];
  const hm = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(t));
  const zoneName = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date(S)).find((p) => p.type === "timeZoneName")?.value;
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / 7200_000) * 7200_000; t <= t1; t += 7200_000) ticks.push(t);
  const target = JURISDICTION_NAMES[jurisdiction];
  const where = (code: string) => placeName(code);
  const meetingBox = { left: `${pct(S)}%`, width: `${pct(E) - pct(S)}%` };
  const chipText = (c: Citation) => `${c.docId.split("/").pop()}${c.timestampSec != null ? ` @${c.timestampSec}s` : c.page ? ` p${c.page}` : ""}`;

  return (
    <section className="card stack" aria-labelledby="tl-h">
      <div className="stack" style={{ ["--gap" as any]: ".4rem" }}>
        <p className="sec-num"><span>01</span> Read · every mark opens its source</p>
        <h2 id="tl-h">Where was each director?</h2>
      </div>
      <p className="muted" style={{ fontSize: "var(--step--1)" }}>
        Meeting {hm(S)}–{hm(E)} {zoneName}, {result.meetingDateText}. Window shown: 6 hours either side.
      </p>

      <div className="tl">
        <div className="tl-axis" aria-hidden="true">
          <span className="tl-label" />
          <div className="tl-track">
            <span className="tl-meeting-tab" style={meetingBox}>Meeting</span>
            {ticks.map((t) => <span key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}>{hm(t)}</span>)}
          </div>
        </div>

        {company.directors
          .filter((d) => meeting.attendeeIds.includes(d.id))
          .map((d) => {
            const p = evaluation.presence.find((q) => q.directorId === d.id);
            const mine = facts.filter((f) => f.directorId === d.id);
            const status = p?.status ?? "unknown";
            const label = status === "present" ? `Evidence places in ${target}` : status === "absent" ? `Evidence: not in ${target}` : "Unproven";
            const claims = mine.filter((f): f is Claim => f.kind === "claimed_location");
            const minutes = claims.find((f) => f.source === "minutes");
            const recording = claims.find((f) => f.source === "recording");
            const evidence = mine.filter((f) => f.kind === "hotel_stay" || f.kind === "flight_leg");
            // A spoken or written claim that puts the director outside the jurisdiction undermines the minutes: red.
            const conflicts = (f: Claim) => jurisdictionOf(f.placeCode) !== jurisdiction;
            const cites = (p?.cites ?? []).concat(p?.claimConflict?.cites ?? []).filter((c, i, a) => a.findIndex((z) => z.docId === c.docId && z.timestampSec === c.timestampSec) === i);
            const finding = p?.contradiction
              ? `Minutes say ${p.contradiction.claimed}. Evidence says ${p.contradiction.evidence}.`
              : p?.claimConflict ? `Minutes say ${p.claimConflict.minutes}. The recording says ${p.claimConflict.recording}.` : p?.reason ?? "";

            return (
              <div className="tl-dir" key={d.id}>
                <div className="tl-who">
                  <strong>{d.name}{d.isChair ? " (Chair)" : ""}</strong>
                  <span className={`pill ${status}`}><StatusIcon s={status} /> {label}</span>
                </div>

                <div className="tl-rows">
                  {minutes && (
                    <div className="tl-row">
                      <span className="tl-label">Minutes say</span>
                      <div className="tl-track">
                        <span className="tl-window" style={meetingBox} />
                        <button className="tl-claim" style={meetingBox} onClick={() => onCite(minutes.cite)} aria-label={`Minutes claim ${where(minutes.placeCode)}: “${minutes.cite.quote}”. Open the minutes.`}>
                          {where(minutes.placeCode)}
                        </button>
                      </div>
                    </div>
                  )}
                  {recording && (
                    <div className="tl-row">
                      <span className="tl-label">Recording</span>
                      <div className="tl-track">
                        <span className="tl-window" style={meetingBox} />
                        <button className={`tl-dot${conflicts(recording) ? " bad" : ""}`} style={{ left: `${pct(S)}%` }} onClick={() => onCite(recording.cite)} aria-label={`Recording at ${recording.cite.timestampSec}s says ${where(recording.placeCode)}. Play it.`} />
                        <span className={`tl-note${conflicts(recording) ? " bad" : ""}`} style={{ left: `calc(${pct(E)}% + .5rem)` }}>
                          Recording at {Math.floor((recording.cite.timestampSec ?? 0) / 60)}:{String(Math.round((recording.cite.timestampSec ?? 0) % 60)).padStart(2, "0")} · says {where(recording.placeCode)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="tl-row">
                    <span className="tl-label">Evidence</span>
                    <div className="tl-track">
                      <span className="tl-window" style={meetingBox} />
                      {evidence.length === 0 && <span className="tl-note" style={{ left: 0 }}>No travel or hotel evidence in the pack</span>}
                      {evidence.map((f, i) => {
                        if (f.kind === "hotel_stay") {
                          const inT = jurisdictionOf(f.placeCode) === jurisdiction;
                          const a = pct(Date.parse(f.checkInUtc)), b = pct(Date.parse(f.checkOutUtc));
                          return (
                            <button key={i} className={`tl-bar ${inT ? "ok" : "bad"}`} style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%` }} onClick={() => onCite(f.cite)}
                              aria-label={`Hotel stay in ${where(f.placeCode)}. Open the hotel bill.`}>
                              <StatusIcon s={inT ? "ok" : "bad"} /> Hotel stay · {where(f.placeCode)}{!inT && status === "absent" ? " · covers the whole meeting" : ""}
                            </button>
                          );
                        }
                        if (f.kind === "flight_leg") {
                          const a = pct(Date.parse(f.departUtc)), b = pct(Date.parse(f.arriveUtc));
                          const text = `Flight ${f.originCode}→${f.destCode} ${hm(Date.parse(f.departUtc))}–${hm(Date.parse(f.arriveUtc))}`;
                          const after = b < 70;
                          return (
                            <span key={i}>
                              <button className="tl-bar flight" style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }} onClick={() => onCite(f.cite)} aria-label={`${text}. Open the travel document.`} />
                              <span className="tl-note" style={after ? { left: `calc(${b}% + .5rem)` } : { right: `calc(${100 - a}% + .5rem)` }}>{text}</span>
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>

                {/* Phone layout: the same three sources as stacked cards. */}
                <ul className="tl-cards">
                  {minutes && <li className="said claim"><span className="proof-src">Minutes say</span><span>{where(minutes.placeCode)} · <q>{minutes.cite.quote}</q></span></li>}
                  {recording && <li className={`said ${conflicts(recording) ? "against" : ""}`}><span className="proof-src">Recording · {recording.cite.timestampSec}s</span><q>{recording.cite.quote}</q></li>}
                  {evidence.map((f, i) => (
                    <li key={i} className={`said ${f.kind === "hotel_stay" ? (jurisdictionOf(f.placeCode) === jurisdiction ? "ok" : "against") : ""}`}>
                      <span className="proof-src">Evidence</span>
                      <span>{f.kind === "hotel_stay" ? `Hotel stay · ${where(f.placeCode)}` : `Flight ${f.originCode}→${f.destCode} ${hm(Date.parse(f.departUtc))}–${hm(Date.parse(f.arriveUtc))}`}</span>
                    </li>
                  ))}
                </ul>

                <p className={`tl-finding${p?.contradiction || p?.claimConflict ? " bad" : ""}`}>
                  <StatusIcon s={p?.contradiction || p?.claimConflict ? "bad" : status} /> {finding}{" "}
                  {cites.map((c, i) => <button key={i} className="chip" onClick={() => onCite(c)}>{chipText(c)}</button>)}
                </p>
              </div>
            );
          })}
      </div>

      <div className="legend" aria-hidden="true">
        <span><i className="lg-claim" />Claimed (not yet proven)</span>
        <span><i style={{ background: "var(--ok)" }} />Evidence in {target}</span>
        <span><i style={{ background: "var(--bad)" }} />Evidence elsewhere</span>
        <span><i className="lg-flight" />In flight</span>
      </div>
    </section>
  );
}

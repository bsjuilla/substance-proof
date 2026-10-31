/** Hero image: the hero meeting's real documents (rendered by scripts/render-hero.ts from the same templates as the
 *  PDFs the model reads), laid on a desk and marked up the way a reviewer would. Marks are placed in % of each
 *  document so they stay on the right words at every size. Decorative: the proof strip below says the same in text. */
export function EvidenceDesk() {
  return (
    <figure className="desk" aria-hidden="true">
      <div className="paper folio">
        <img src="hero/folio-dubai.png" alt="" width={1588} height={1040} />
        <span className="ring" style={{ left: "45.5%", top: "6.6%", width: "18.5%", height: "8%" }} />
      </div>

      <div className="paper minutes">
        <img src="hero/minutes.png" alt="" width={1588} height={1520} />
        <span className="hl" style={{ left: "58.3%", top: "28.3%", width: "15.2%", height: "2.6%" }} />
        <span className="ink-note claim" style={{ left: "76%", top: "27.2%" }}>claimed</span>
      </div>

      <div className="paper tape">
        <span className="tape-label"><b>recording.wav</b> 0:40</span>
        <img className="wave" src="hero/waveform.svg" alt="" />
        <span className="cursor" style={{ left: "calc(46% + 1rem)" }} />
        <span className="tape-quote">“I'm dialing in from my hotel in Dubai”</span>
      </div>

      <div className="stamp-verdict">
        <span className="v">NOT MET</span>
        <span>Quorum not met in Jersey · 2 of 3 elsewhere</span>
      </div>
    </figure>
  );
}

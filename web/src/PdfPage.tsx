import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Box = { left: number; top: number; width: number; height: number };
type Props = { url: string; page: number; quote?: string; near?: string[]; title: string };

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Renders one PDF page and highlights the exact words the extractor quoted. Matching is done in code on the
 *  page's own text layer, so a highlight only appears where the words really are. When the quote occurs more
 *  than once (e.g. "present in St Helier" on every row of an attendance table), the occurrence closest to a
 *  `near` word (the director's name) is chosen. Image-only scans have no text layer, so nothing is highlighted. */
export function PdfPage({ url, page, quote, near = [], title }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [state, setState] = useState<"loading" | "found" | "not-found" | "no-text" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | undefined;
    (async () => {
      try {
        setState("loading");
        setBoxes([]);
        doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        const width = Math.max(320, wrap.current?.clientWidth ?? 800);
        const base = p.getViewport({ scale: 1 });
        const scale = width / base.width;
        const vp = p.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        const css = p.getViewport({ scale });
        const c = canvas.current!;
        c.width = vp.width;
        c.height = vp.height;
        c.style.width = `${css.width}px`;
        c.style.height = `${css.height}px`;
        await p.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        if (cancelled) return;

        const text = await p.getTextContent();
        const items = text.items.filter((i): i is (typeof text.items)[number] & { str: string; transform: number[]; width: number; height: number } => "str" in i);
        if (!items.some((i) => i.str.trim())) return setState("no-text");
        if (!quote) return setState("not-found");

        // One long string of the page with each item's character range, so a quote can span several items.
        // pdf.js emits empty and space-only items between table cells; skip them so words join with one space.
        let full = "";
        const ranges = items.filter((it) => norm(it.str)).map((it) => {
          const start = full.length;
          full += norm(it.str) + " ";
          return { it, start, end: full.length - 1 };
        });
        const q = norm(quote);
        const hits: number[] = [];
        for (let i = full.indexOf(q); i >= 0; i = full.indexOf(q, i + 1)) hits.push(i);
        if (!hits.length) return setState("not-found");

        const rectOf = (it: (typeof items)[number]): Box => {
          const [x, y] = css.convertToViewportPoint(it.transform[4], it.transform[5]);
          const h = Math.hypot(it.transform[2], it.transform[3]) * scale;
          return { left: x, top: y - h, width: it.width * scale, height: h * 1.2 };
        };
        const boxesFor = (at: number) => ranges.filter((r) => r.end > at && r.start < at + q.length).map((r) => rectOf(r.it));

        // Disambiguate repeated quotes by distance to the director's name on the page.
        let best = hits[0];
        const anchors = near.map(norm).filter(Boolean).flatMap((n) => {
          const out: Box[] = [];
          for (let i = full.indexOf(n); i >= 0; i = full.indexOf(n, i + 1)) out.push(...boxesFor(i).slice(0, 1));
          return out;
        });
        if (hits.length > 1 && anchors.length) {
          const dist = (at: number) => Math.min(...boxesFor(at).flatMap((b) => anchors.map((a) => Math.abs(a.top - b.top))));
          best = hits.reduce((a, b) => (dist(b) < dist(a) ? b : a));
        }
        setBoxes(boxesFor(best));
        setState("found");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [url, page, quote, near.join("|")]);

  return (
    <div className="pdf-page" ref={wrap}>
      <p className="pdf-status small muted" role="status">
        {state === "loading" && "Opening the page…"}
        {state === "found" && "The quoted words are highlighted on the page."}
        {state === "not-found" && "The quote could not be located in this page's text, so nothing is highlighted."}
        {state === "no-text" && "This page is an image (a scan or photo), so the words cannot be highlighted; the quote is shown alongside."}
        {state === "error" && "Showing the page in the browser's own viewer (word highlighting is unavailable here)."}
      </p>
      {state === "error" && <iframe className="pdf-fallback" src={`${url}#page=${page}&toolbar=0&navpanes=0&view=FitH`} title={title} />}
      <div className="pdf-canvas" hidden={state === "error"}>
        <canvas ref={canvas} role="img" aria-label={title} />
        {boxes.map((b, i) => <span key={i} className="pdf-hl" style={{ left: b.left - 2, top: b.top - 1, width: b.width + 4, height: b.height }} />)}
      </div>
    </div>
  );
}

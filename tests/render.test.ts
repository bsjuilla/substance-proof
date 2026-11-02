import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { pdfPagesAsPng } from "../src/extract/secondReader";

/** A one-page PDF that uses Helvetica WITHOUT embedding it, as most office and reporting tools produce. */
function pdfWithStandardFont(text: string): string {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 36 Tf 72 700 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 36 Tf 72 700 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const file = join(mkdtempSync(join(tmpdir(), "sp-test-")), "folio.pdf");
  writeFileSync(file, body);
  return file;
}

describe("second reader page rendering", () => {
  it("draws the text of a PDF whose fonts are not embedded (they used to render as a blank page)", async () => {
    const [png] = await pdfPagesAsPng(pdfWithStandardFont("Arrival 10/03/2026 St Helier"));
    const img = await loadImage(Buffer.from(png.split(",")[1], "base64"));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 128) dark++;
    expect(dark).toBeGreaterThan(500);
  });
});

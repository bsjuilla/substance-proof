// Builds a harder copy of a synthetic set with Muse Image, so the reader is measured on documents nobody here templated.
//   MODE=photo     : every travel and stay document is re-shot as a realistic phone photo (images/edits).
//   MODE=newlayout : every single-flight boarding pass / e-ticket is replaced by a boarding pass in a NEW layout,
//                    drawn by Muse Image from the answer-key facts (images/generations).
// The minutes are never touched and the answer key is copied unchanged. Every output is AI-made: its file name starts
// with AIPHOTO_ and it is listed in manifest.json with the model and prompt. A person then opens review.html and fills
// audit.csv (did the image model change any text?) before anything is scored or published.
// Usage: IMAGE_MODEL=muse-image-1.0 MODE=photo SRC_SET=test OUT_SET=test-photo CAP_USD=1.00 npx tsx scripts/photograph-set.ts [t01 t02 ...]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { makeClient } from "../src/extract/client";
import { pdfPagesAsPng } from "../src/extract/secondReader";
import {
  CostCap, LAYOUT_STYLES, MUSE_IMAGE_USD_PER_IMAGE, PHOTO_PROMPT, evidenceFiles, localTime, newLayoutPrompt, packRel, photoRel,
  type ManifestEntry,
} from "./lib/photoSet";

const ROOT = join(import.meta.dirname, "..");
const MODEL = process.env.IMAGE_MODEL;
const MODE = (process.env.MODE ?? "photo") as "photo" | "newlayout";
const SRC_SET = process.env.SRC_SET ?? "test";
const OUT_SET = process.env.OUT_SET ?? `${SRC_SET}-${MODE}`;
const cap = new CostCap(Number(process.env.CAP_USD ?? 1.0));
if (!MODEL) throw new Error("Set IMAGE_MODEL (the official ID is muse-image-1.0: https://dev.meta.ai/docs/models).");
if (OUT_SET === SRC_SET) throw new Error("OUT_SET must differ from SRC_SET: the published sets are never overwritten.");

const SRC = join(ROOT, "synthetic", "generated", SRC_SET);
const OUT = join(ROOT, "synthetic", "generated", OUT_SET);

async function asDataUrl(file: string): Promise<string> {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return (await pdfPagesAsPng(file, 1))[0]; // page 1: travel and stay documents here are one page
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

// Raw HTTP with the Meta-specific JSON body (https://dev.meta.ai/docs/image-generation, "Edit an image").
// Search and code tools are switched off: nothing real (logos, places) should be pulled into a synthetic document.
async function callImages(path: "generations" | "edits", body: Record<string, unknown>, base: string, key: string): Promise<Buffer> {
  cap.reserve(MUSE_IMAGE_USD_PER_IMAGE);
  const r = await fetch(`${base.replace(/\/$/, "")}/images/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, n: 1, output_format: "png", reasoning_strength: "low",
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
      user: "substance-proof-eval", ...body,
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${j?.error?.code ?? ""} ${j?.error?.message ?? ""}`.trim());
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in response");
  cap.add(MUSE_IMAGE_USD_PER_IMAGE * (j.data?.length ?? 1)); // billed per returned image
  return Buffer.from(b64, "base64");
}

async function main() {
  const { client } = makeClient(); // loads .env; the key is used only in the Authorization header below
  const base = String((client as any).baseURL), key = String((client as any).apiKey);
  const only = process.argv.slice(2);
  const ids = readdirSync(join(SRC, "packs")).filter((d) => /^[a-z]\d+$/i.test(d) && (!only.length || only.includes(d))).sort();
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(join(OUT, "packs"), { recursive: true });
  cpSync(join(SRC, "answers"), join(OUT, "answers"), { recursive: true });
  const manifest: ManifestEntry[] = [];
  let seed = 0;
  outer: for (const id of ids) {
    cpSync(join(SRC, "packs", id), join(OUT, "packs", id), { recursive: true }); // start from an exact copy
    const ans = JSON.parse(readFileSync(join(SRC, "answers", `${id}.json`), "utf8"));
    const names: Record<string, string> = Object.fromEntries(ans.company.directors.map((d: any) => [d.id, d.name]));
    for (const file of evidenceFiles(join(SRC, "packs", id))) {
      const rel = packRel(join(SRC, "packs"), file);
      let prompt = PHOTO_PROMPT;
      let body: Record<string, unknown>;
      let path: "generations" | "edits" = "edits";
      if (MODE === "newlayout") {
        const legs = (ans.facts as any[]).filter((f) => f.kind === "flight_leg" && f.cite?.docId === rel);
        if (legs.length !== 1 || !rel.includes("/travel/")) continue; // only one-flight travel documents are replaced
        const f = legs[0];
        const dep = localTime(f.originCode, f.departUtc), arr = localTime(f.destCode, f.arriveUtc);
        if (!dep || !arr) continue;
        prompt = newLayoutPrompt({ passenger: names[f.directorId], from: f.originCode, to: f.destCode, date: dep.date, dep: dep.time,
          arr: arr.date === dep.date ? arr.time : `${arr.time} on ${arr.date}`, flight: `SX ${100 + ((seed * 37) % 800)}`, style: LAYOUT_STYLES[seed % LAYOUT_STYLES.length] });
        seed++;
        body = { prompt, size: "1536x1024" };
        path = "generations";
      } else {
        body = { prompt, images: [{ image_url: await asDataUrl(file) }] };
      }
      const outRel = photoRel(rel);
      const entry: ManifestEntry = { source: rel, output: outRel, mode: MODE, model: MODEL!, prompt, aiMade: true, ok: false, costUsd: 0 };
      if (!cap.canSpend(MUSE_IMAGE_USD_PER_IMAGE)) { console.log(`cap reached at $${cap.spent.toFixed(2)}; stopping`); break outer; }
      try {
        const before = cap.spent;
        const png = await callImages(path, body, base, key);
        mkdirSync(dirname(join(OUT, "packs", outRel)), { recursive: true });
        writeFileSync(join(OUT, "packs", outRel), png);
        rmSync(join(OUT, "packs", rel)); // the pack now holds the AI-made image INSTEAD of the original
        Object.assign(entry, { ok: true, costUsd: +(cap.spent - before).toFixed(4) });
        console.log(`ok   ${rel} -> ${outRel}`);
      } catch (e) {
        entry.error = (e as Error).message; // the original stays in the pack; reported, not hidden
        console.log(`FAIL ${rel}: ${entry.error}`);
      }
      manifest.push(entry);
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ mode: MODE, model: MODEL, srcSet: SRC_SET, builtAt: new Date().toISOString(), costUsd: +cap.spent.toFixed(4), capUsd: cap.capUsd, aiMade: "Every AIPHOTO_* file was generated by Muse Image and is synthetic.", entries: manifest }, null, 1));
  // Side-by-side page for the human text audit, and the audit sheet to fill in.
  const ok = manifest.filter((m) => m.ok);
  writeFileSync(join(OUT, "review.html"), `<!doctype html><meta charset=utf-8><title>Text audit: ${OUT_SET}</title><style>body{font:14px system-ui}figure{display:inline-block;width:48%;vertical-align:top;margin:0}img{max-width:100%;border:1px solid #ccc}</style><h1>Did the image model change any text? (${OUT_SET}, AI-made images on the right)</h1>` +
    ok.map((m) => `<h3>${m.output}</h3><figure>${m.mode === "photo" ? `${/\.pdf$/i.test(m.source) ? `<iframe src="../${SRC_SET}/packs/${m.source}" width="100%" height="600"></iframe>` : `<img src="../${SRC_SET}/packs/${m.source}">`}<figcaption>original: ${m.source}</figcaption>` : `<pre>${m.prompt.replace(/</g, "&lt;")}</pre>`}</figure> <figure><img src="packs/${m.output}"><figcaption>AI-made (Muse Image)</figcaption></figure>`).join("\n"));
  writeFileSync(join(OUT, "audit.csv"), "file,text_changed,notes\n" + ok.map((m) => `${m.output},,`).join("\n") + "\n");
  console.log(`\n${ok.length}/${manifest.length} images made, $${cap.spent.toFixed(2)} spent (cap $${cap.capUsd.toFixed(2)}). Next: open ${OUT_SET}/review.html, fill audit.csv (yes/no), then run scripts/score-photo.ts.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

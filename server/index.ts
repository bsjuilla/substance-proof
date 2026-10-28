// Local server for LIVE mode. Binds to 127.0.0.1 only. The Meta API key stays in .env on this machine and
// never reaches the browser. Serves the built web app, the sample packs, and two analysis endpoints.
// Run: npm run app   (then open http://127.0.0.1:8787)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { analyzePack } from "../src/app/analyze";
import { makeClient } from "../src/extract/client";
import { buildPack } from "../src/rules/buildPack";
import type { RulePack } from "../src/rules/pack";
import type { Company, Meeting } from "../src/engine/types";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "web", "dist");
const GEN = join(ROOT, "synthetic", "generated");
const UPLOADS = join(ROOT, "uploads");
const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 60 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  const raw = Buffer.isBuffer(body) || typeof body === "string";
  res.end(raw ? (body as Buffer | string) : JSON.stringify(body));
}

/** Serve a file only if it resolves inside `base` (no path traversal). */
function serveFile(res: ServerResponse, base: string, relPath: string) {
  const full = normalize(join(base, decodeURIComponent(relPath)));
  if (!full.startsWith(base + sep) || !existsSync(full) || !statSync(full).isFile()) return send(res, 404, { error: "not found" });
  send(res, 200, readFileSync(full), TYPES[extname(full).toLowerCase()] ?? "application/octet-stream");
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("Upload too large (limit 60 MB).");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : /\.(pdf|png|jpe?g|webp|wav)$/i.test(e.name) ? [join(dir, e.name)] : [],
  );

let live: ReturnType<typeof makeClient> | null = null;
try {
  live = makeClient();
} catch {
  live = null; // no key: the app still works in replay mode
}

function samples() {
  const out: { set: string; id: string; company: string; jurisdiction: string; trap: string }[] = [];
  for (const set of ["dev", "test"]) {
    const dir = join(GEN, set, "answers");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      const a = JSON.parse(readFileSync(join(dir, f), "utf8"));
      out.push({ set, id: a.scenario.id, company: a.company.name, jurisdiction: a.scenario.jurisdiction, trap: set === "dev" ? a.scenario.trap : "Held-out test meeting" });
    }
  }
  return out;
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

/** The validated, AI-written rule pack for a jurisdiction (built by scripts/build-packs.ts from the official text). */
function loadApprovedPack(j: string): RulePack | undefined {
  const f = join(ROOT, "web", "public", "rulepacks", `${j}.json`);
  if (!existsSync(f)) return undefined;
  const b = JSON.parse(readFileSync(f, "utf8"));
  return { ...b.pack, tests: b.approvedTests };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;

    // Every POST spends API credit, so only accept JSON requests from this app's own pages. This blocks other
    // websites from making the browser call this local server (CSRF / DNS rebinding).
    if (req.method === "POST") {
      const host = req.headers.host ?? "";
      const origin = req.headers.origin ?? "";
      const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
      const allowedOrigins = [...allowedHosts.map((h) => `http://${h}`), "http://localhost:5173", "http://127.0.0.1:5173"];
      const json = (req.headers["content-type"] ?? "").startsWith("application/json");
      if (!allowedHosts.includes(host) || (origin && !allowedOrigins.includes(origin)) || !json) {
        return send(res, 403, { error: "Rejected: requests must come from the Substance Proof app itself." });
      }
    }

    if (p === "/api/health") return send(res, 200, { live: !!live, model: live?.model ?? null });
    if (p === "/api/samples") return send(res, 200, samples());
    if (p.startsWith("/files/")) {
      const [, , set, ...rest] = p.split("/");
      if (set !== "dev" && set !== "test") return send(res, 404, { error: "not found" });
      return serveFile(res, join(GEN, set, "packs"), rest.join("/"));
    }
    if (p.startsWith("/uploads/")) return serveFile(res, UPLOADS, p.slice("/uploads/".length));

    if (p === "/api/analyze-sample" && req.method === "POST") {
      if (!live) return send(res, 400, { error: "No META_API_KEY in .env, so live analysis is off. Recorded runs still work." });
      const { set, id, usePack } = await readJson(req);
      if (!/^(dev|test)$/.test(set) || !/^[a-z]\d{2}$/.test(id)) return send(res, 400, { error: "bad sample id" });
      const packs = join(GEN, set, "packs");
      const ans = JSON.parse(readFileSync(join(GEN, set, "answers", `${id}.json`), "utf8"));
      const result = await analyzePack({
        client: live.client, model: live.model, id, files: listFiles(join(packs, id)), packRoot: packs,
        company: ans.company, meeting: ans.meeting, jurisdiction: ans.scenario.jurisdiction,
        pack: usePack ? loadApprovedPack(ans.scenario.jurisdiction) : undefined,
      });
      return send(res, 200, { result, fileBase: `/files/${set}/` });
    }

    if (p === "/api/build-pack" && req.method === "POST") {
      if (!live) return send(res, 400, { error: "No META_API_KEY in .env, so live analysis is off." });
      const { title, text } = await readJson(req);
      const src = String(text ?? "");
      if (src.length < 200) return send(res, 400, { error: "Paste the full text of the law or guidance (at least a few paragraphs)." });
      if (src.length > 600_000) return send(res, 400, { error: "Text too long (limit 600,000 characters)." });
      const built = await buildPack(live.client, live.model, String(title || "Pasted source").slice(0, 200), src);
      return send(res, 200, { ...built, model: live.model, builtAt: new Date().toISOString(), sourceChars: src.length });
    }

    if (p === "/api/analyze-upload" && req.method === "POST") {
      if (!live) return send(res, 400, { error: "No META_API_KEY in .env, so live analysis is off." });
      const body = await readJson(req);
      const s = body.setup ?? {};
      const j = s.jurisdiction === "SG" ? "SG" : "JE";
      const directors = (s.directors ?? []).filter((d: any) => d?.name?.trim()).slice(0, 12)
        .map((d: any, i: number) => ({ id: String.fromCharCode(65 + i), name: String(d.name).trim().slice(0, 80), isChair: !!d.isChair, hasStrategicAuthority: d.strategic !== false }));
      if (directors.length === 0) return send(res, 400, { error: "Add at least one director." });
      const files: { name: string; base64: string }[] = (body.files ?? []).slice(0, 40);
      if (files.length === 0) return send(res, 400, { error: "Add the meeting documents." });
      const runId = randomUUID();
      const dir = join(UPLOADS, runId, "pack");
      mkdirSync(dir, { recursive: true });
      const paths = files.map((f) => {
        const out = join(dir, safeName(f.name));
        if (!/\.(pdf|png|jpe?g|webp|wav)$/i.test(out)) throw new Error(`Unsupported file type: ${f.name}`);
        writeFileSync(out, Buffer.from(f.base64, "base64"));
        return out;
      });
      const company: Company = {
        id: "UPLOAD", name: String(s.companyName || "Uploaded company").slice(0, 120), directors,
        quorumRequired: Math.max(1, Math.min(12, Number(s.quorum) || 2)), options: {},
      };
      const now = new Date().toISOString();
      const meeting: Meeting = {
        id: runId, startUtc: now, endUtc: now, // replaced by the time read from the minutes
        mode: s.mode === "virtual" ? "virtual" : s.mode === "hybrid" ? "hybrid" : "in_person",
        venueCode: s.mode === "virtual" ? undefined : j === "JE" ? "CITY:STHELIER" : "CITY:SINGAPORE",
        attendeeIds: directors.map((d: any) => d.id), chairId: directors.find((d: any) => d.isChair)?.id,
        isStrategic: !!s.isStrategic, minutesRecordStrategicDecisions: s.minutesRecordStrategic !== false,
        minutesAndRecordsKeptInJurisdiction: s.recordsKept === "yes" ? true : s.recordsKept === "no" ? false : undefined,
      };
      const result = await analyzePack({ client: live.client, model: live.model, id: runId, files: paths, packRoot: join(UPLOADS, runId), company, meeting, jurisdiction: j });
      return send(res, 200, { result, fileBase: `/uploads/${runId}/` });
    }

    // Static web app
    if (!existsSync(DIST)) return send(res, 200, "Run `npm run web:build` first, or use `npm run web:dev` for development.", "text/plain");
    const rel = p === "/" ? "index.html" : p.slice(1);
    const full = normalize(join(DIST, rel));
    if (full.startsWith(DIST + sep) && existsSync(full) && statSync(full).isFile()) return serveFile(res, DIST, rel);
    return serveFile(res, DIST, "index.html");
  } catch (e: any) {
    console.error(e);
    return send(res, 500, { error: String(e?.message ?? e).slice(0, 300) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Substance Proof running at http://127.0.0.1:${PORT}  (live analysis: ${live ? "ON, model " + live.model : "OFF, no key"})`);
});

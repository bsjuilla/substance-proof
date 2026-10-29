// Attacks the local server the way a hostile web page or local tool would. Run with the app running:
//   node security/poc-http.mjs
// Each line prints the attack, the status it got, and whether that is the safe answer.
// No attack here spends API credit: every POST is either rejected or carries an invalid sample id.
import { request } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);

function hit({ method = "GET", path, headers = {}, body }) {
  return new Promise((ok) => {
    const req = request({ host: "127.0.0.1", port: PORT, method, path, headers: { Host: `127.0.0.1:${PORT}`, ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => ok({ status: res.statusCode, body: data }));
    });
    req.on("error", (e) => ok({ status: 0, body: String(e) }));
    if (body) req.write(body);
    req.end();
  });
}

const json = { "Content-Type": "application/json" };
const bad = JSON.stringify({ set: "dev", id: "zz" }); // valid shape, invalid id: never reaches the API

const attacks = [
  // CSRF: a page on another site posting to the local server.
  { name: "CSRF: POST from evil.example origin", safe: 403, req: { method: "POST", path: "/api/analyze-sample", headers: { ...json, Origin: "https://evil.example" }, body: bad } },
  { name: "CSRF: 'simple' text/plain form POST (no preflight)", safe: 403, req: { method: "POST", path: "/api/analyze-sample", headers: { "Content-Type": "text/plain", Origin: "https://evil.example" }, body: bad } },
  { name: "CSRF: Origin 'null' (sandboxed iframe)", safe: 403, req: { method: "POST", path: "/api/build-pack", headers: { ...json, Origin: "null" }, body: "{}" } },
  // DNS rebinding: evil.example resolves to 127.0.0.1, so the browser sends Host: evil.example.
  { name: "DNS rebinding: POST with foreign Host", safe: 403, req: { method: "POST", path: "/api/analyze-sample", headers: { ...json, Host: `evil.example:${PORT}` }, body: bad } },
  { name: "DNS rebinding: GET sample list with foreign Host", safe: 403, req: { path: "/api/samples", headers: { Host: `evil.example:${PORT}` } } },
  { name: "DNS rebinding: GET an uploaded file with foreign Host", safe: 403, req: { path: "/uploads/x/pack/a.pdf", headers: { Host: `evil.example:${PORT}` } } },
  // Path traversal to the API key in .env (two and three levels, encoded slash and backslash).
  { name: "Traversal: /files/dev/..%2F..%2F..%2F..%2F.env", safe: 404, req: { path: "/files/dev/..%2F..%2F..%2F..%2F.env" } },
  { name: "Traversal: /files/dev/..%5C..%5C..%5C..%5C.env", safe: 404, req: { path: "/files/dev/..%5C..%5C..%5C..%5C.env" } },
  { name: "Traversal: /uploads/..%2F.env", safe: 404, req: { path: "/uploads/..%2F.env" } },
  // The URL parser folds %2e%2e into "..", so this lands on the app's index page, never on .env.
  { name: "Traversal: /uploads/%2e%2e/.env", safe: 200, expectNot: "META_API_KEY=", req: { path: "/uploads/%2e%2e/.env" } },
  { name: "Traversal: static /..%2F.env", safe: 200, expectNot: "META_API_KEY=", req: { path: "/..%2F.env" } },
  { name: "Traversal: absolute C:%5CWindows%5Cwin.ini", safe: 404, req: { path: "/uploads/C:%5CWindows%5Cwin.ini" } },
  { name: "Traversal: sibling prefix /files/dev/..%2Fpacks-evil", safe: 404, req: { path: "/files/dev/..%2Fpacks-evil" } },
  // Malformed input should fail closed with a short error, not crash or leak a stack trace.
  { name: "Malformed %-encoding", safe: 404, req: { path: "/files/dev/%E0%A4%A" } },
  { name: "Invalid JSON body", safe: 400, req: { method: "POST", path: "/api/analyze-sample", headers: json, body: "{not json" } },
  { name: "Unexpected method PUT", safe: 405, req: { method: "PUT", path: "/api/analyze-sample", headers: json, body: bad } },
  { name: "Sample id injection ../", safe: 400, req: { method: "POST", path: "/api/analyze-sample", headers: json, body: JSON.stringify({ set: "dev", id: "../../.env" }) } },
];

let failures = 0;
for (const a of attacks) {
  const r = await hit(a.req);
  // A leak is a key VALUE, a stack trace or a local path; naming the variable in an error message is fine.
  const leaked = /META_API_KEY\s*=|\bsk-[A-Za-z0-9]{8}|at Object\.|\\Users\\|\/home\//i.test(r.body);
  const ok = r.status === a.safe && !leaked && (!a.expectNot || !r.body.includes(a.expectNot));
  if (!ok) failures++;
  console.log(`${ok ? "SAFE  " : "VULN  "} ${String(r.status).padEnd(4)} ${a.name}${leaked ? "  (response leaks secrets or paths)" : ""}`);
}
console.log(failures ? `\n${failures} attack(s) not handled safely.` : `\nAll ${attacks.length} attacks handled safely.`);
process.exit(failures ? 1 : 0);

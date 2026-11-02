// Checks that your API keys (META_API_KEY and NVIDIA_API_KEY in .env) appear nowhere in the working tree or in any
// commit, and looks for other key-like strings in tracked files. Prints counts only, never a key.
// Works on a clean clone too (no .env): then it runs only the generic key-pattern scan.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const keys = ["META_API_KEY", "NVIDIA_API_KEY"]
  .map((name) => (env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "").trim())
  .filter((k) => k.length >= 16);
const revs = execFileSync("git", ["rev-list", "--all"]).toString().trim().split("\n");

let hits = 0;
let working = 0;
for (const key of keys) {
  for (const rev of revs) {
    try {
      execFileSync("git", ["grep", "-q", "-F", key, rev], { stdio: "ignore" });
      hits++;
    } catch {
      /* exit 1 = not found in this commit */
    }
  }
  try {
    execFileSync("git", ["grep", "-q", "-F", "--untracked", key], { stdio: "ignore" });
    working++;
  } catch {
    /* not found */
  }
}

// Other key-like strings in tracked files (Meta, NVIDIA, OpenAI-style, GitHub tokens, bearer tokens).
let generic = "";
try {
  generic = execFileSync("git", ["grep", "-c", "-E", "(sk-[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|Bearer [A-Za-z0-9._-]{30,})"], { encoding: "utf8" }).trim();
} catch {
  generic = ""; // git grep exits 1 when nothing matches
}
if (!keys.length) console.log("No key in .env to look for (no .env, or no key in it): running the generic key-pattern scan only.");
else console.log(`keys looked for: ${keys.length}; commits scanned: ${revs.length}; commits containing a key: ${hits}; tracked/untracked working files containing a key: ${working}`);
console.log(`other key-like strings in tracked files: ${generic ? generic : "none"}`);
if (hits || working || generic) process.exitCode = 1;

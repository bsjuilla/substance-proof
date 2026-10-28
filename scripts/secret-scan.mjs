// Checks that the API key in .env appears nowhere in the working tree or in any commit. Prints counts only.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const key = (env.match(/^META_API_KEY=(.*)$/m)?.[1] ?? "").trim();
if (key.length < 16) throw new Error("No key found in .env to scan for");
const revs = execFileSync("git", ["rev-list", "--all"]).toString().trim().split("\n");
let hits = 0;
for (const rev of revs) {
  try {
    execFileSync("git", ["grep", "-q", "-F", key, rev], { stdio: "ignore" });
    hits++;
  } catch {
    /* exit 1 = not found in this commit */
  }
}
let working = 0;
try {
  execFileSync("git", ["grep", "-q", "-F", "--untracked", key], { stdio: "ignore" });
  working = 1;
} catch {}
// Also look for any other key-like strings in tracked files.
let generic = "";
try {
  generic = execFileSync("git", ["grep", "-c", "-E", "(sk-[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer [A-Za-z0-9._-]{30,})"], { encoding: "utf8" }).trim();
} catch {
  generic = ""; // git grep exits 1 when nothing matches
}
console.log(`commits scanned: ${revs.length}; commits containing the key: ${hits}; tracked/untracked working files containing the key: ${working}`);
console.log(`other key-like strings in tracked files: ${generic ? generic : "none"}`);

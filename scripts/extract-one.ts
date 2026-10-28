// Small paid test: extract facts from the documents given on the command line and print them.
import { makeClient } from "../src/extract/client";
import { extractDocument } from "../src/extract/extractDocument";

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("Pass one or more file paths.");
const { client, model } = makeClient();
let total = 0;
for (const f of files) {
  const r = await extractDocument(client, model, f);
  total += r.costUsd;
  console.log("\n=== " + f);
  console.log(JSON.stringify(r.extraction, null, 1));
  console.log(`tokens in/out/reasoning: ${r.usage.input_tokens}/${r.usage.output_tokens}/${r.usage.reasoning_tokens}  cost $${r.costUsd.toFixed(5)}  ${r.ms}ms`);
}
console.log(`\nTOTAL COST $${total.toFixed(5)}`);

import { makeClient, costUsd } from "../src/extract/client";

const { client, model } = makeClient();
const r = await client.responses.create({ model, input: "Reply with exactly: ready", max_output_tokens: 20 });
console.log("model:", model);
console.log("reply:", r.output_text);
console.log("usage:", r.usage);
console.log("cost USD ~", costUsd(r.usage as any).toFixed(6));

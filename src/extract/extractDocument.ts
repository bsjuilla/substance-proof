import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type OpenAI from "openai";
import { costUsd } from "./client";
import { EXTRACTION_JSON_SCHEMA, ExtractionSchema, SYSTEM_PROMPT, type Extraction } from "./schema";

export type ExtractResult = {
  file: string;
  extraction: Extraction;
  usage: { input_tokens: number; output_tokens: number; reasoning_tokens: number };
  costUsd: number;
  ms: number;
};

function contentPart(path: string) {
  const bytes = readFileSync(path);
  const b64 = bytes.toString("base64");
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") {
    return { type: "input_file" as const, filename: basename(path), file_data: `data:application/pdf;base64,${b64}` };
  }
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
  return { type: "input_image" as const, image_url: `data:${mime};base64,${b64}`, detail: "high" as const };
}

export async function extractDocument(
  client: OpenAI,
  model: string,
  path: string,
  opts: { reasoningEffort?: "low" | "medium" | "high" } = {},
): Promise<ExtractResult> {
  const t0 = Date.now();
  const r: any = await client.responses.create({
    model,
    max_output_tokens: 6000,
    reasoning: { effort: opts.reasoningEffort ?? "low" },
    text: {
      format: { type: "json_schema", name: "document_extraction", strict: true, schema: EXTRACTION_JSON_SCHEMA as any },
    },
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [{ type: "input_text", text: "Extract the facts from this document." }, contentPart(path) as any] },
    ],
  });
  const raw = r.output_text as string;
  if (!raw) throw new Error(`Empty model output for ${path} (status ${r.status}, usage ${JSON.stringify(r.usage)})`);
  const extraction = ExtractionSchema.parse(JSON.parse(raw)); // validate again client-side
  return {
    file: path,
    extraction,
    usage: {
      input_tokens: r.usage?.input_tokens ?? 0,
      output_tokens: r.usage?.output_tokens ?? 0,
      reasoning_tokens: r.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    },
    costUsd: costUsd(r.usage),
    ms: Date.now() - t0,
  };
}

import OpenAI from "openai";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Loads .env (never committed) and builds a client for the Meta Model API (OpenAI-compatible).
export function makeClient(): { client: OpenAI; model: string } {
  const envPath = join(import.meta.dirname, "..", "..", ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new Error("META_API_KEY is missing. Copy .env.example to .env and add your key.");
  const client = new OpenAI({
    baseURL: process.env.META_API_BASE_URL || "https://api.meta.ai/v1",
    apiKey,
  });
  return { client, model: process.env.META_MODEL_EXTRACT || "muse-spark-1.3" };
}

// Official prices (dev.meta.ai/docs/pricing-rate-limits, fetched 26 Oct 2026), USD per 1M tokens.
export const PRICE = { in: 1.25, cachedIn: 0.15, out: 4.25 };

export function costUsd(u: { input_tokens?: number; output_tokens?: number } | undefined): number {
  if (!u) return 0;
  return ((u.input_tokens ?? 0) * PRICE.in + (u.output_tokens ?? 0) * PRICE.out) / 1_000_000;
}

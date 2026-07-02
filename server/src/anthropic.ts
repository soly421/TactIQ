import Anthropic from "@anthropic-ai/sdk";

// Claude Fable 5 — Anthropic's most capable model. Thinking is always on (no
// `thinking` param), and we opt into server-side fallbacks so a safety-classifier
// refusal is transparently re-served by Opus 4.8 inside the same call.
export const MODEL = process.env.TACTIQ_MODEL ?? "claude-fable-5";
export const FALLBACK_MODEL = "claude-opus-4-8";
export const BETAS = ["server-side-fallback-2026-06-01"];
export const FALLBACKS = [{ model: FALLBACK_MODEL }];

export const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

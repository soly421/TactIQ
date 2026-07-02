import Anthropic from "@anthropic-ai/sdk";

// Claude Opus 4.8 — most capable Opus-tier model, adaptive thinking, structured outputs.
export const MODEL = process.env.TACTIQ_MODEL ?? "claude-opus-4-8";

export const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

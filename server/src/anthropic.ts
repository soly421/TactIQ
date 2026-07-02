import Anthropic from "@anthropic-ai/sdk";

// Tiered engine strategy:
//  - free  → cheapest cost-effective models: Haiku 4.5 for chat, Sonnet 5 for
//            structured visualizations (big JSON schemas need the stronger model).
//  - pro   → Claude Fable 5 everywhere, with server-side fallback to Opus 4.8
//            so a rare safety-classifier decline retries transparently.
export type Plan = "free" | "pro";
export type EngineKind = "chat" | "structured";

const ENGINES: Record<Plan, Record<EngineKind, string>> = {
  free: { chat: "claude-haiku-4-5", structured: "claude-sonnet-5" },
  pro: { chat: "claude-fable-5", structured: "claude-fable-5" },
};

export const FALLBACK_MODEL = "claude-opus-4-8";

export function engineFor(plan: Plan, kind: EngineKind): string {
  const override = process.env.TACTIQ_MODEL;
  if (override) return override;
  return ENGINES[plan][kind];
}

// Fable 5 requires the server-side-fallback beta for transparent refusal rescue.
export function requestExtras(model: string): { betas: string[]; fallbacks?: { model: string }[] } {
  if (model.startsWith("claude-fable")) {
    return { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: FALLBACK_MODEL }] };
  }
  return { betas: [] };
}

export const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

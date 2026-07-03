import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { logModelCall } from "./store.js";

// ============================================================================
// The engine layer: cost-named tiers, two providers, automatic failover.
//
//  Tier        | What the coach sees   | Anthropic         | OpenAI
//  ------------|-----------------------|-------------------|------------------
//  light       | Light Tactical        | claude-haiku-4-5  | gpt-5-mini
//  standard    | Standard Tactical     | claude-sonnet-5   | gpt-5.1
//  deep        | Deep Tactical (Pro)   | claude-fable-5    | gpt-5.1
//
// Provider order is PREFERRED_PROVIDER (default anthropic) then the other; if
// the first provider errors (outage, rate limit, missing key) the call retries
// on the second transparently. Every completed call is written to the
// model_calls ledger with token usage, so cost per user/day is auditable.
// ============================================================================

export type Plan = "free" | "pro";
export type EngineKind = "chat" | "structured";
export type Tier = "light" | "standard" | "deep";
export type Provider = "anthropic" | "openai";

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  light: { label: "Light Tactical", blurb: "Fast, cost-efficient engine for everyday coaching chat" },
  standard: { label: "Standard Tactical", blurb: "Strong engine for structured session and formation visualizations" },
  deep: { label: "Deep Tactical", blurb: "Flagship engine — maximum depth on sessions, game plans, and formations (Pro)" },
};

export function tierFor(plan: Plan, kind: EngineKind): Tier {
  if (process.env.TACTIQ_TIER) return process.env.TACTIQ_TIER as Tier;
  // Pro: Standard (Sonnet 5) for conversation, Deep (Fable 5) for the
  // structured artifacts — sessions, game plans, formations — where the
  // depth actually shows. The explicit Deep Tactical toggle on the board
  // and formation reports also reaches Deep. Free: Light chat, Standard
  // builds. The unit economics keep conversation on Standard even at the $29.99 plan.
  if (plan === "pro") return kind === "chat" ? "standard" : "deep";
  return kind === "chat" ? "light" : "standard";
}

const ANTHROPIC_MODELS: Record<Tier, string> = {
  light: process.env.ANTHROPIC_MODEL_LIGHT || "claude-haiku-4-5",
  standard: process.env.ANTHROPIC_MODEL_STANDARD || "claude-sonnet-5",
  deep: process.env.ANTHROPIC_MODEL_DEEP || "claude-fable-5",
};

const OPENAI_MODELS: Record<Tier, string> = {
  light: process.env.OPENAI_MODEL_LIGHT || "gpt-5-mini",
  standard: process.env.OPENAI_MODEL_STANDARD || "gpt-5.1",
  deep: process.env.OPENAI_MODEL_DEEP || "gpt-5.1",
};

export function modelFor(tier: Tier, provider: Provider): string {
  return provider === "anthropic" ? ANTHROPIC_MODELS[tier] : OPENAI_MODELS[tier];
}

export function availableProviders(): Provider[] {
  const order: Provider[] =
    process.env.PREFERRED_PROVIDER === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  return order.filter((p) =>
    p === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY),
  );
}

export function hasAnyProvider(): boolean {
  return availableProviders().length > 0;
}

// A safety-classifier decline. Not retried cross-provider — surfaced to the coach.
export class RefusalError extends Error {
  constructor() {
    super("That request couldn't be completed. Try rephrasing.");
  }
}

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI();
  return openaiClient;
}

// Fable 5 requires the server-side-fallback beta for transparent refusal rescue.
function anthropicExtras(model: string): { betas?: string[]; fallbacks?: { model: string }[] } {
  if (model.startsWith("claude-fable")) {
    return { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: "claude-opus-4-8" }] };
  }
  return {};
}

// Two cache breakpoints: the static curriculum base (~6k tokens, identical
// across ALL users and features) caches independently of the per-team
// dynamic suffix — so every chat turn reads the base from cache even
// though team memory mutates between turns.
import { baseSystemPrompt } from "./knowledge.js";
function anthropicSystem(system: string): Anthropic.Beta.BetaTextBlockParam[] {
  const base = baseSystemPrompt();
  if (system.startsWith(base) && system.length > base.length) {
    return [
      { type: "text", text: base, cache_control: { type: "ephemeral" } },
      { type: "text", text: system.slice(base.length), cache_control: { type: "ephemeral" } },
    ];
  }
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

type AnthropicMessages = Anthropic.Beta.BetaMessageParam[];

// Translate our canonical (Anthropic-shaped) messages to OpenAI chat format,
// converting base64 image blocks to data-URL image_url parts.
function toOpenAIMessages(system: string, messages: AnthropicMessages): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      out.push({ role: "assistant", content: text });
      continue;
    }
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const b of m.content) {
      if (b.type === "text") parts.push({ type: "text", text: b.text });
      else if (b.type === "image" && b.source.type === "base64") {
        parts.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
      }
    }
    out.push({ role: "user", content: parts });
  }
  return out;
}

export interface EngineResult {
  text: string;
  provider: Provider;
  model: string;
}

interface StreamOpts {
  tier: Tier;
  userId: number;
  system: string;
  messages: AnthropicMessages;
  maxTokens: number;
  onDelta: (text: string) => void;
}

async function anthropicStream(o: StreamOpts, model: string): Promise<EngineResult> {
  const extras = anthropicExtras(model);
  const stream = getAnthropic().beta.messages.stream({
    model,
    max_tokens: o.maxTokens,
    ...(extras.betas ? { betas: extras.betas } : {}),
    ...(extras.fallbacks ? { fallbacks: extras.fallbacks } : {}),
    system: anthropicSystem(o.system),
    messages: o.messages,
  });
  let full = "";
  stream.on("text", (delta) => {
    full += delta;
    o.onDelta(delta);
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new RefusalError();
  logModelCall({
    userId: o.userId, provider: "anthropic", model: final.model ?? model, tier: o.tier,
    inputTokens: final.usage?.input_tokens ?? 0, outputTokens: final.usage?.output_tokens ?? 0,
  });
  return { text: full, provider: "anthropic", model };
}

async function openaiStream(o: StreamOpts, model: string): Promise<EngineResult> {
  const stream = await getOpenAI().chat.completions.create({
    model,
    messages: toOpenAIMessages(o.system, o.messages),
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: o.maxTokens,
  });
  let full = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      full += delta;
      o.onDelta(delta);
    }
    if (chunk.usage) usage = chunk.usage;
  }
  logModelCall({
    userId: o.userId, provider: "openai", model, tier: o.tier,
    inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0,
  });
  return { text: full, provider: "openai", model };
}

// Stream a chat completion through the first healthy provider.
export async function streamText(o: StreamOpts): Promise<EngineResult> {
  let lastErr: unknown = null;
  for (const provider of availableProviders()) {
    const model = modelFor(o.tier, provider);
    try {
      return provider === "anthropic" ? await anthropicStream(o, model) : await openaiStream(o, model);
    } catch (err) {
      if (err instanceof RefusalError) throw err;
      console.error(`[engine] ${provider}/${model} failed, trying next provider:`, err instanceof Error ? err.message : err);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("No model provider configured");
}

interface StructuredOpts {
  tier: Tier;
  userId: number;
  system: string;
  user: string | Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  maxTokens: number;
}

async function anthropicStructured(o: StructuredOpts, model: string): Promise<EngineResult> {
  const extras = anthropicExtras(model);
  const stream = getAnthropic().beta.messages.stream({
    model,
    max_tokens: o.maxTokens,
    ...(extras.betas ? { betas: extras.betas } : {}),
    ...(extras.fallbacks ? { fallbacks: extras.fallbacks } : {}),
    system: anthropicSystem(o.system),
    messages: [{ role: "user", content: o.user }],
    output_config: { format: { type: "json_schema", schema: o.schema } },
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new RefusalError();
  const text = final.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No structured output returned.");
  logModelCall({
    userId: o.userId, provider: "anthropic", model: final.model ?? model, tier: o.tier,
    inputTokens: final.usage?.input_tokens ?? 0, outputTokens: final.usage?.output_tokens ?? 0,
  });
  return { text: text.text, provider: "anthropic", model };
}

async function openaiStructured(o: StructuredOpts, model: string): Promise<EngineResult> {
  const messages = toOpenAIMessages(o.system, [{ role: "user", content: o.user }] as AnthropicMessages);
  const completion = await getOpenAI().chat.completions.create({
    model,
    messages,
    max_completion_tokens: o.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: "tactiq_output", schema: o.schema, strict: false },
    },
  });
  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") throw new RefusalError();
  const text = choice?.message?.content;
  if (!text) throw new Error("No structured output returned.");
  logModelCall({
    userId: o.userId, provider: "openai", model, tier: o.tier,
    inputTokens: completion.usage?.prompt_tokens ?? 0, outputTokens: completion.usage?.completion_tokens ?? 0,
  });
  return { text, provider: "openai", model };
}

// Schema-constrained JSON through the first healthy provider.
export async function structuredText(o: StructuredOpts): Promise<EngineResult> {
  let lastErr: unknown = null;
  for (const provider of availableProviders()) {
    const model = modelFor(o.tier, provider);
    try {
      return provider === "anthropic" ? await anthropicStructured(o, model) : await openaiStructured(o, model);
    } catch (err) {
      if (err instanceof RefusalError) throw err;
      console.error(`[engine] ${provider}/${model} structured failed, trying next provider:`, err instanceof Error ? err.message : err);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("No model provider configured");
}

export function engineSummary(plan: Plan): Record<EngineKind, { tier: Tier; label: string; model: string; provider: Provider | "none" }> {
  const providers = availableProviders();
  const provider: Provider | "none" = providers.length > 0 ? providers[0] : "none";
  const describe = (kind: EngineKind) => {
    const tier = tierFor(plan, kind);
    return {
      tier,
      label: TIER_INFO[tier].label,
      model: provider === "none" ? "demo" : modelFor(tier, provider),
      provider,
    };
  };
  return { chat: describe("chat"), structured: describe("structured") };
}

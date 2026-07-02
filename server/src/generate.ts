import type { Response } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, hasApiKey, requestExtras } from "./anthropic.js";
import { loadStore } from "./store.js";

export function teamContext(): string {
  const store = loadStore();
  if (!store.squad) return "\n<team_memory>\nThe coach has not set up a team profile yet. If relevant, suggest they add their squad in the My Team tab so advice can be personalized.\n</team_memory>";
  const s = store.squad;
  const recent = store.season
    .slice(0, 8)
    .map((e) => `- [${e.date.slice(0, 10)}] ${e.kind}: ${e.title} — ${e.summary}`)
    .join("\n");
  return `
<team_memory>
This coach's team (use it — make every answer specific to THIS team):
- Team: ${s.teamName} (${s.ageGroup}, ${s.format}, ${s.level} level)
- Coach experience level: ${s.coachExperience || "intermediate"} (adapt your language per <coach_experience_adaptation>)
- Preferred style: ${s.preferredStyle || "not specified"}
- Roster notes: ${s.rosterNotes || "none"}
- Season goals: ${s.seasonGoals || "none"}

Recent season activity (their training/tactical history — build on it, reference it, avoid repeating themes back-to-back):
${recent || "- nothing yet, this is early in the season"}
</team_memory>`;
}

interface StreamArgs {
  model: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
  mockText: string;
  doneExtra?: Record<string, unknown>;
  onDone?: (fullText: string) => void;
}

// Server-sent-events streaming of a chat completion. Emits {type:"delta"|"done"|"error"}.
export async function streamToSSE(res: Response, args: StreamArgs): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  if (!hasApiKey) {
    for (const chunk of args.mockText.match(/.{1,24}/gs) ?? []) {
      send({ type: "delta", text: chunk });
      await new Promise((r) => setTimeout(r, 15));
    }
    send({ type: "done", ...args.doneExtra });
    res.end();
    args.onDone?.(args.mockText);
    return;
  }

  try {
    const extras = requestExtras(args.model);
    const stream = getClient().beta.messages.stream({
      model: args.model,
      max_tokens: args.maxTokens ?? 8000,
      ...(extras.betas.length ? { betas: extras.betas } : {}),
      ...(extras.fallbacks ? { fallbacks: extras.fallbacks } : {}),
      system: args.system,
      messages: args.messages,
    });

    let full = "";
    stream.on("text", (delta) => {
      full += delta;
      send({ type: "delta", text: delta });
    });

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send({ type: "error", message: "That request couldn't be completed. Try rephrasing your question." });
    } else {
      send({ type: "done", ...args.doneExtra });
      args.onDone?.(full);
    }
  } catch (err) {
    console.error("stream error", err);
    send({ type: "error", message: "The coaching engine hit a problem. Please try again." });
  }
  res.end();
}

// Build message content from text + optional base64 image (data URL from the client).
export function userContent(text: string, imageDataUrl?: string): Anthropic.Beta.BetaContentBlockParam[] | string {
  if (!imageDataUrl) return text;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(imageDataUrl);
  if (!match) return text;
  return [
    {
      type: "image",
      source: { type: "base64", media_type: match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: match[2] },
    },
    { type: "text", text },
  ];
}

interface StructuredArgs<T> {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  mock: T;
}

// Structured JSON generation via output_config.format — guaranteed schema-valid output.
export async function generateStructured<T>(args: StructuredArgs<T>): Promise<T> {
  if (!hasApiKey) return args.mock;

  const extras = requestExtras(args.model);
  const stream = getClient().beta.messages.stream({
    model: args.model,
    max_tokens: args.maxTokens ?? 24000,
    ...(extras.betas.length ? { betas: extras.betas } : {}),
    ...(extras.fallbacks ? { fallbacks: extras.fallbacks } : {}),
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: {
      format: { type: "json_schema", schema: args.schema },
    },
  });

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("The model declined this request. Try adjusting your inputs.");
  }
  const text = final.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No structured output returned.");
  return JSON.parse(text.text) as T;
}

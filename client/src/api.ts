import type { AwardResult } from "./types";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

export async function sendJSON<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (extra: { award?: AwardResult; remaining?: number }) => void;
  onError: (message: string) => void;
}

// POST + read a server-sent-events response.
export async function streamSSE(path: string, body: unknown, cb: StreamCallbacks): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    cb.onError((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "delta") cb.onDelta(event.text);
        else if (event.type === "done") cb.onDone(event);
        else if (event.type === "error") cb.onError(event.message);
      } catch {
        // ignore malformed frames
      }
    }
  }
}

import type { AwardResult } from "./types";

const TOKEN_KEY = "tactiq_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function handle401(status: number): void {
  if (status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("tactiq:signout"));
  }
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: headers(false) });
  if (!res.ok) {
    handle401(res.status);
    throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function sendJSON<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, { method, headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) {
    handle401(res.status);
    throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (extra: { award?: AwardResult; remaining?: number }) => void;
  onError: (message: string) => void;
}

export async function streamSSE(path: string, body: unknown, cb: StreamCallbacks): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    handle401(res.status);
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

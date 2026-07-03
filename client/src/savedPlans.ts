import type { SessionPlan } from "./types";

// Offline session stash: the field has no wifi. Every generated session is
// saved to localStorage so tonight's plan opens even with zero connectivity
// (the PWA shell caches the app itself).
//
// The stash is scoped per signed-in coach — on a shared laptop, coach B must
// never open coach A's cached sessions. App.tsx sets the scope after login.

const BASE_KEY = "tactiq:savedPlans";
const MAX = 12;

let scope = "";

export function setPlansScope(userId: number | string): void {
  scope = String(userId);
}

function key(): string {
  return scope ? `${BASE_KEY}:${scope}` : BASE_KEY;
}

export interface SavedPlan {
  savedAt: string;
  plan: SessionPlan;
}

export function getOfflinePlans(): SavedPlan[] {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? "[]") as SavedPlan[];
  } catch {
    return [];
  }
}

export function savePlanOffline(plan: SessionPlan): void {
  try {
    const list = getOfflinePlans().filter((s) => s.plan.title !== plan.title);
    list.unshift({ savedAt: new Date().toISOString(), plan });
    localStorage.setItem(key(), JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

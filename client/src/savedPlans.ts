import type { SessionPlan } from "./types";

// Offline session stash: the field has no wifi. Every generated session is
// saved to localStorage so tonight's plan opens even with zero connectivity
// (the PWA shell caches the app itself).

const KEY = "tactiq:savedPlans";
const MAX = 12;

export interface SavedPlan {
  savedAt: string;
  plan: SessionPlan;
}

export function getOfflinePlans(): SavedPlan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedPlan[];
  } catch {
    return [];
  }
}

export function savePlanOffline(plan: SessionPlan): void {
  try {
    const list = getOfflinePlans().filter((s) => s.plan.title !== plan.title);
    list.unshift({ savedAt: new Date().toISOString(), plan });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

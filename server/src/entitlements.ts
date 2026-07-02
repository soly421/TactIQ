import { kvGet, kvSet } from "./store.js";
import type { Plan } from "./providers.js";

// ============================================================================
// The free/pro matrix. One rule governs it: never gate the magic (team memory,
// session generation, pre/post game), gate the breadth. All enforcement lives
// in the API — the UI locks are presentation, not security.
// ============================================================================

export interface Entitlements {
  maxStaffAdvisors: number; // built-in advisors a free coach can "sign"
  customAdvisors: boolean;
  libraryUnlocksPerMonth: number;
  filmClipsPerMonth: number;
  liveBench: boolean;
  seasonPlanner: boolean;
  maxTeams: number;
}

const MATRIX: Record<Plan, Entitlements> = {
  free: {
    maxStaffAdvisors: 3,
    customAdvisors: false,
    libraryUnlocksPerMonth: 5,
    filmClipsPerMonth: 1,
    liveBench: false,
    seasonPlanner: false,
    maxTeams: 1,
  },
  pro: {
    maxStaffAdvisors: Number.MAX_SAFE_INTEGER,
    customAdvisors: true,
    libraryUnlocksPerMonth: Number.MAX_SAFE_INTEGER,
    filmClipsPerMonth: Number.MAX_SAFE_INTEGER,
    liveBench: true,
    seasonPlanner: true,
    maxTeams: 8,
  },
};

export function entitlementsFor(plan: Plan): Entitlements {
  return MATRIX[plan];
}

// ---- monthly counters (kv-backed) ----

function monthKey(kind: string, userId: number): string {
  return `${kind}:${userId}:${new Date().toISOString().slice(0, 7)}`;
}

export function monthlyCount(kind: "libunlock" | "filmclip", userId: number): number {
  return Number(kvGet(monthKey(kind, userId)) ?? 0);
}

export function bumpMonthly(kind: "libunlock" | "filmclip", userId: number): void {
  kvSet(monthKey(kind, userId), String(monthlyCount(kind, userId) + 1));
}

// ---- the free coach's staff: the first 3 advisors they talk to are signed ----

export function getStaff(userId: number): string[] {
  try {
    return JSON.parse(kvGet(`staff:${userId}`) ?? "[]") as string[];
  } catch {
    return [];
  }
}

// Returns true if this advisor is available (already signed, or a slot was free
// and they've just been signed). False = staff is full and they're not on it.
export function signOrCheckAdvisor(userId: number, advisorId: string, max: number): boolean {
  const staff = getStaff(userId);
  if (staff.includes(advisorId)) return true;
  if (staff.length >= max) return false;
  staff.push(advisorId);
  kvSet(`staff:${userId}`, JSON.stringify(staff));
  return true;
}

// Standard shape for a gate refusal — the client turns upgrade:true into a checkout CTA.
export function upgradeError(message: string): { error: string; upgrade: true } {
  return { error: message, upgrade: true };
}

import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "./api";

// What the coach's plan includes, with live usage — drives every locked state.
export interface Entitlements {
  plan: "free" | "pro";
  staff: string[];
  maxStaffAdvisors: number | null; // null = unlimited
  customAdvisors: boolean;
  libraryUnlocksLeft: number | null;
  filmClipsLeft: number | null;
  liveBench: boolean;
  seasonPlanner: boolean;
  maxTeams: number;
  billingConfigured: boolean;
}

export function useEntitlements(): Entitlements | null {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    void getJSON<Entitlements>("/api/entitlements").then(setEnt).catch(() => {});
  }, []);
  return ent;
}

// One-tap path to Pro: Stripe checkout when billing is configured, otherwise
// point at the dev plan toggle.
export async function goUpgrade(billingConfigured: boolean): Promise<void> {
  if (billingConfigured) {
    const r = await sendJSON<{ url: string }>("/api/billing/checkout", {});
    if (r.url) window.location.href = r.url;
    return;
  }
  alert("Billing isn't configured on this server — use the plan chip in the top bar to switch plans (dev mode).");
}

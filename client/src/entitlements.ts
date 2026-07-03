import { useEffect, useState } from "react";
import { getJSON } from "./api";

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
  libraryCount: number;
  billingConfigured: boolean;
}

export function useEntitlements(): Entitlements | null {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    void getJSON<Entitlements>("/api/entitlements").then(setEnt).catch(() => {});
  }, []);
  return ent;
}

// Every upgrade CTA funnels through the Plans page — the annual option
// converts better than a blind jump into monthly checkout.
export async function goUpgrade(_billingConfigured: boolean): Promise<void> {
  window.dispatchEvent(new Event("tactiq:pricing"));
}

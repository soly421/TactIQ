import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Simple JSON-file persistence for the single-coach MVP. Swap for a real DB when
// accounts/community go multi-user.

export interface SquadProfile {
  teamName: string;
  coachExperience: "new" | "intermediate" | "experienced";
  ageGroup: string;
  format: string; // 4v4 | 7v7 | 9v9 | 11v11
  level: string; // rec | travel | academy
  preferredStyle: string;
  rosterNotes: string;
  seasonGoals: string;
}

export interface SeasonEntry {
  id: string;
  date: string;
  kind: "session" | "formation" | "guidance" | "chat";
  title: string;
  summary: string;
  payload?: unknown;
}

export interface Progress {
  xp: number;
  streak: number;
  lastActiveDay: string;
  badges: string[];
  counts: Record<string, number>;
  advisorsUsed: string[];
}

export interface Usage {
  day: string;
  messages: number;
}

export interface CustomAdvisor {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  goodFor: string;
  philosophy: string;
  custom: true;
}

export interface XpPoint {
  t: string; // ISO timestamp
  xp: number; // cumulative xp after the event
}

export interface StoreData {
  squad: SquadProfile | null;
  season: SeasonEntry[];
  progress: Progress;
  usage: Usage;
  settings: { plan: "free" | "pro" };
  customAdvisors: CustomAdvisor[];
  xpHistory: XpPoint[];
  libraryPlans: Record<string, unknown>; // templateId -> hydrated plan
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULTS: StoreData = {
  squad: null,
  season: [],
  progress: { xp: 0, streak: 0, lastActiveDay: "", badges: [], counts: {}, advisorsUsed: [] },
  usage: { day: today(), messages: 0 },
  settings: { plan: "free" },
  customAdvisors: [],
  xpHistory: [],
  libraryPlans: {},
};

let cache: StoreData | null = null;

export function loadStore(): StoreData {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    cache = structuredClone(DEFAULTS);
  }
  return cache!;
}

export function saveStore(): void {
  if (!cache) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
}

export function rollUsage(store: StoreData): void {
  if (store.usage.day !== today()) {
    store.usage = { day: today(), messages: 0 };
  }
}

export function addSeasonEntry(entry: Omit<SeasonEntry, "id" | "date">): SeasonEntry {
  const store = loadStore();
  const full: SeasonEntry = {
    ...entry,
    id: Math.random().toString(36).slice(2, 10),
    date: new Date().toISOString(),
  };
  store.season.unshift(full);
  if (store.season.length > 200) store.season.pop();
  saveStore();
  return full;
}

export { today };

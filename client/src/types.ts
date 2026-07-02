export interface Advisor {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  goodFor: string;
  formats: string[];
  custom: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Movement {
  from: Point;
  to: Point;
  kind: "run" | "pass" | "dribble";
}

export interface DrillDiagram {
  attackers: Point[];
  defenders: Point[];
  neutrals: Point[];
  cones: Point[];
  balls: Point[];
  goals: Point[];
  movements: Movement[];
}

export interface Drill {
  name: string;
  phase: string;
  durationMinutes: number;
  area: string;
  organization: string;
  coachingPoints: string[];
  progressions: string[];
  diagram: DrillDiagram;
}

export interface SessionPlan {
  title: string;
  ageGroup: string;
  durationMinutes: number;
  theme: string;
  objectives: string[];
  equipment: string[];
  drills: Drill[];
  coachReminders: string[];
}

export interface FormationPosition {
  label: string;
  role: string;
  x: number;
  y: number;
  keyInstructions: string[];
  suggestedPlayer?: string;
}

export interface FormationAnalysis {
  recommendedFormation: string;
  formationRationale: string;
  positions: FormationPosition[];
  inPossession: string[];
  outOfPossession: string[];
  transitions: string[];
  strengths: string[];
  vulnerabilities: string[];
  trainingPriorities: string[];
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
}

export interface AwardResult {
  xpGained: number;
  newBadges: { id: string; name: string; emoji: string; description: string }[];
  questsCompleted: { id: string; title: string; emoji: string; bonusXp: number }[];
  leveledUp: boolean;
}

export interface Progress {
  xp: number;
  xpToday: number;
  xpHistory: { t: string; xp: number }[];
  plan: "free" | "pro";
  level: { level: number; title: string; xp: number; nextXp: number | null; nextTitle: string | null };
  streak: number;
  counts: Record<string, number>;
  advisorsUsed: number;
  quests: Quest[];
  badges: Badge[];
  usage: { used: number; limit: number };
  leaderboard: { rank: number; name: string; xp: number; you?: boolean }[];
}

export interface PlayerNote {
  name: string;
  number: string;
  positions: string;
  foot: string;
  notes: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  plan: "free" | "pro";
  club: { id: number; name: string; code: string } | null;
}

export interface Quest {
  id: string;
  title: string;
  emoji: string;
  target: number;
  bonusXp: number;
  progress: number;
  done: boolean;
}

export interface SquadProfile {
  teamName: string;
  players?: PlayerNote[];
  coachExperience: "new" | "intermediate" | "experienced";
  ageGroup: string;
  format: string;
  level: string;
  preferredStyle: string;
  rosterNotes: string;
  seasonGoals: string;
}

export interface SeasonEntry {
  id: string;
  date: string;
  kind: "session" | "formation" | "guidance" | "chat" | "match" | "film";
  title: string;
  summary: string;
  payload?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface School {
  id: string;
  name: string;
  region: string;
  emoji: string;
  description: string;
}

export interface SessionTemplate {
  id: string;
  topic: string;
  topicName: string;
  phase: string;
  emoji: string;
  ageBand: string;
  complexity: string;
  format: string;
  title: string;
  theme: string;
  description: string;
  unlocked: boolean;
  collection?: "signature" | "blueprint";
  tradition?: string;
}

export interface EngineInfo {
  tier: "light" | "standard" | "deep";
  label: string;
  model: string;
  provider: string;
}

export interface Settings {
  plan: "free" | "pro";
  chatModel: string;
  structuredModel: string;
  dailyLimit: number;
  engines?: { chat: EngineInfo; structured: EngineInfo };
  billingConfigured?: boolean;
  tokensToday?: { input: number; output: number; calls: number };
}

export interface GamePlan {
  matchTitle: string;
  keysToTheGame: string[];
  inPossession: string[];
  outOfPossession: string[];
  setPieces: string[];
  matchups: { zone: string; plan: string; exploit: boolean }[];
  firstTenMinutes: string[];
  pregameTalk: string;
  benchNotes: string[];
  ifChasing: string[];
  ifProtecting: string[];
}

export interface SeasonPlan {
  title: string;
  ageGroup: string;
  weeks: { week: number; block: string; theme: string; objectives: string[]; sessionIdeas: string[]; gameFocus: string }[];
  principles: string[];
  checkpoints: string[];
}

export interface ClubOverview {
  club: { name: string; code: string; philosophy: string; isAdmin: boolean };
  coaches: { id: number; name: string; xp: number; streak: number; sessions: number; matchdays: number; chats: number; lastActiveDay: string; level: { level: number; title: string } }[];
  totals: { coaches: number; sessions: number; xp: number; activeToday: number };
}

export interface ClubSession {
  id: number;
  title: string;
  description: string;
  content: string;
  created_at: string;
  uploaded_by_name?: string;
}

export interface ClubComment {
  id: number;
  text: string;
  created_at: string;
  author: string;
}

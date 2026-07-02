export interface Advisor {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
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
  leveledUp: boolean;
}

export interface Progress {
  xp: number;
  level: { level: number; title: string; xp: number; nextXp: number | null; nextTitle: string | null };
  streak: number;
  counts: Record<string, number>;
  advisorsUsed: number;
  badges: Badge[];
  usage: { used: number; limit: number };
  leaderboard: { rank: number; name: string; xp: number; you?: boolean }[];
}

export interface SquadProfile {
  teamName: string;
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
  kind: "session" | "formation" | "guidance" | "chat";
  title: string;
  summary: string;
  payload?: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

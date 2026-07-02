import { db } from "./db.js";
import { weekStart } from "./community.js";

// The Touchline Debate: one tactical dilemma per week. Coaches vote with a
// tap, see the live split instantly, and the verdict drops on the weekend.
// Zero-moderation social (structured voting, no free text) — and over time,
// a dataset nobody else owns: how youth coaches actually think.

export interface Debate {
  id: string;
  scenario: string;
  options: { id: string; label: string }[];
  verdict: string; // revealed Saturday onward
}

const POOL: Debate[] = [
  {
    id: "protect-lead",
    scenario: "U11, up 1-0 with five minutes left. The other team is throwing everyone forward. What's your call?",
    options: [
      { id: "a", label: "Park it — drop deep, clear every ball" },
      { id: "b", label: "Keep playing out like we train" },
      { id: "c", label: "Press their panic — go for the second" },
    ],
    verdict: "B — with a caveat. At U11 the scoreboard is a guest; the habits are the residents. If your team abandons its game every time it leads, you've taught them your training only counts when it's easy. But 'keep playing' doesn't mean 'take silly risks in your own box' — play out with purpose, and if the pressure is genuinely breaking you, the answer is better spacing, not the long boot. C is the fun answer and sometimes right with a brave group; A teaches fear.",
  },
  {
    id: "star-player",
    scenario: "Your best player scores four a game but never passes. Parents of other kids are grumbling. Do you…",
    options: [
      { id: "a", label: "Let them cook — talent shouldn't be caged" },
      { id: "b", label: "Add a constraint: two-touch or must-assist games" },
      { id: "c", label: "Bench them until they share it" },
    ],
    verdict: "B — constraints beat confrontation. A two-touch rule or 'goals only count after a wall pass' turns sharing into a puzzle the star wants to solve, instead of a punishment they resent. A stunts the player (defenders get better; solo runs stop working around U13, and they'll have no other tools). C turns your best trainer into an enemy. The constraint game develops the star AND the teammates.",
  },
  {
    id: "keeper-rotation",
    scenario: "U10, nobody wants to play goalkeeper. What's your policy?",
    options: [
      { id: "a", label: "Everyone rotates — one half each, no exceptions" },
      { id: "b", label: "Ask for volunteers and reward them" },
      { id: "c", label: "Put your weakest field player in goal" },
    ],
    verdict: "A — with energy. At U10 the keeper shirt should be a rotation like any position, sold with enthusiasm ('keeper controls the whole game!'). B slowly creates a permanent keeper by default at an age where nobody should specialize. C is the classic mistake — it tells that child exactly what you think of them, and everyone else notices too.",
  },
  {
    id: "losing-badly",
    scenario: "Halftime, you're down 0-5 to a much better team. Your talk is…",
    options: [
      { id: "a", label: "Challenge them: win the second half 'game'" },
      { id: "b", label: "Pure comfort: smiles, effort praise, no tactics" },
      { id: "c", label: "One fixable picture: 'their 9 scores because…'" },
    ],
    verdict: "A + C together. Reset the scoreboard ('second half starts 0-0 — win it') AND give them ONE concrete fixable thing, not five. Kids down 0-5 don't need a tactics lecture, but pure comfort (B) with nothing to DO leaves them helpless. Agency is the antidote to humiliation: a winnable mini-game and one clear job.",
  },
  {
    id: "equal-time",
    scenario: "League semifinal. Do your weakest players get their usual equal minutes?",
    options: [
      { id: "a", label: "Yes — development policy doesn't have playoff exceptions" },
      { id: "b", label: "Slightly fewer, but everyone plays meaningful minutes" },
      { id: "c", label: "Best XI plays; subs get garbage time if safe" },
    ],
    verdict: "A at U12 and below, B is defensible at U14+ IF you announced the policy in August. The real error isn't the choice — it's springing a new policy on families in the semifinal. The kids always know exactly what you did, whatever you tell yourself. And the club that plays everyone in the final is the club nobody leaves in November.",
  },
  {
    id: "opponent-press",
    scenario: "Their whole team presses your goal kicks and it's chaos. Your U12 keeper wants to just boot it. You say…",
    options: [
      { id: "a", label: "Boot it for today — we'll train it Tuesday" },
      { id: "b", label: "Keep playing short, whatever it costs" },
      { id: "c", label: "Middle path: one designated 'out' plus permission to go long when it's not on" },
    ],
    verdict: "C — teach the decision, not the dogma. 'Always play short' and 'always boot it' are both coach comfort blankets. Give the keeper one rehearsed short option and one long target, and the AUTHORITY to choose. That's what playing out of the back actually is — a decision, not a religion. Then yes, train the press-escape Tuesday.",
  },
  {
    id: "trainer-vs-gamer",
    scenario: "One kid is brilliant in training, invisible in games. Another is average in training, a warrior on Saturday. Who starts?",
    options: [
      { id: "a", label: "The trainer — reward the week, not the weekend" },
      { id: "b", label: "The gamer — matches are the truth" },
      { id: "c", label: "Alternate starts and tell them exactly why" },
    ],
    verdict: "C — and the 'why' conversation matters more than the minutes. The trainer needs to hear that games are where training goes to live; the gamer needs to hear that Saturday form earns Tuesday standards. Both kids are giving you half of the same player. Your job is to name the missing half out loud, kindly, and keep both hungry.",
  },
  {
    id: "ref-decision",
    scenario: "The ref gives a terrible call that costs you a goal. Your players look at you. You…",
    options: [
      { id: "a", label: "Say nothing to the ref — 'next play' to the team" },
      { id: "b", label: "Calmly ask the ref about it at the next stoppage" },
      { id: "c", label: "Let the ref hear about it — the kids deserve defending" },
    ],
    verdict: "A, ruthlessly. Your players mirror your sideline within 30 seconds — every study of youth sideline behavior finds the same thing. 'Next play' is the single most valuable phrase in youth soccer. B is acceptable once, quietly, for genuinely dangerous calls. C teaches your team that officials control their emotions, which is a losing life strategy delivered by a trusted adult.",
  },
  {
    id: "position-lock",
    scenario: "A parent emails: their U11 'is a striker' and shouldn't be played in defense. Your reply?",
    options: [
      { id: "a", label: "Politely hold the line: everyone plays everywhere until U13" },
      { id: "b", label: "Compromise: mostly striker, some rotation" },
      { id: "c", label: "Let them specialize — passion beats policy" },
    ],
    verdict: "A — and make it a club letter, not a personal argument. Every professional academy on earth rotates positions through U12; the 'striker' who never defended becomes the U15 striker who can't press and gets cut. Share the U12 exit profile: both feet, every position understood, 1v1 bravery both ways. Specialization at 10 is how adults steal options from children.",
  },
  {
    id: "tournament-fatigue",
    scenario: "Tournament weekend, game four in two days. Legs are gone. You can win it with your tired best five playing the whole game, or rotate and probably lose. It's…",
    options: [
      { id: "a", label: "Rotate — bodies over trophies, every time" },
      { id: "b", label: "Ride the best five — finals are memories" },
      { id: "c", label: "Ask the players and let them choose" },
    ],
    verdict: "A, and it isn't close at youth level. Game four in 48 hours is where overuse injuries live, and an 11-year-old will always say 'I'm fine.' The memory you're actually making with B is next month's physio visit. The honorable version of 'finals are memories': rotate fully AND tell the team the medal counts double because everyone earned it.",
  },
];

// Deterministic weekly pick from the pool.
export function currentDebate(): Debate {
  const ws = weekStart();
  const seed = [...ws].reduce((a, c) => a + c.charCodeAt(0), 0);
  return POOL[seed % POOL.length];
}

export function verdictUnlocked(): boolean {
  // Saturday (day 5 of the league week that starts Monday) onward
  const start = new Date(`${weekStart()}T00:00:00Z`).getTime();
  return Date.now() >= start + 5 * 86_400_000;
}

export function castVote(userId: number, choice: string): void {
  db.prepare(
    "INSERT INTO debate_votes (user_id, week, choice) VALUES (?, ?, ?) ON CONFLICT(user_id, week) DO UPDATE SET choice = excluded.choice",
  ).run(userId, weekStart(), choice);
}

export function debateState(userId: number): {
  debate: { id: string; scenario: string; options: { id: string; label: string }[] };
  yourVote: string | null;
  totals: Record<string, number>;
  voteCount: number;
  verdict: string | null;
  verdictAt: string;
} {
  const d = currentDebate();
  const ws = weekStart();
  const rows = db.prepare("SELECT choice, COUNT(*) n FROM debate_votes WHERE week = ? GROUP BY choice").all(ws) as { choice: string; n: number }[];
  const totals: Record<string, number> = {};
  for (const o of d.options) totals[o.id] = 0;
  for (const r of rows) totals[r.choice] = r.n;
  const mine = db.prepare("SELECT choice FROM debate_votes WHERE user_id = ? AND week = ?").get(userId, ws) as { choice: string } | undefined;
  const verdictAt = new Date(new Date(`${ws}T00:00:00Z`).getTime() + 5 * 86_400_000).toISOString();
  return {
    debate: { id: d.id, scenario: d.scenario, options: d.options },
    yourVote: mine?.choice ?? null,
    totals,
    voteCount: rows.reduce((a, r) => a + r.n, 0),
    verdict: verdictUnlocked() ? d.verdict : null,
    verdictAt,
  };
}

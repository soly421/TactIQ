// The Session Library: a programmatic catalog organized the way coaches actually
// search — by topic, phase, age band, and complexity. Each template is an index
// entry; unlocking it generates the full session live, adapted to the coach's
// team, so every unlock is unique. Schools of thought remain as an optional
// generation flavor (used by Session Studio).

export interface School {
  id: string;
  name: string;
  region: string;
  emoji: string;
  description: string;
}

export const SCHOOLS: School[] = [
  { id: "spanish", name: "Spanish Positional School", region: "Spain", emoji: "🇪🇸", description: "Rondos, positional games, the free man, build-up bravery. Small spaces, big brains." },
  { id: "dutch", name: "Dutch Total Football", region: "Netherlands", emoji: "🇳🇱", description: "4v4/7v7 as the teaching game, universal players, width and diagonals, individual-technique obsession." },
  { id: "german", name: "German Pressing Academy", region: "Germany", emoji: "🇩🇪", description: "Gegenpressing, transition moments, intensity as a skill." },
  { id: "italian", name: "Italian Defensive Craft", region: "Italy", emoji: "🇮🇹", description: "The art of defending: shape, duels, reading the game." },
  { id: "southam", name: "South American Street & Futsal", region: "Brazil / Argentina", emoji: "🌎", description: "Futsal foundations, 1v1 audacity, improvisation. Joy first, structure second." },
  { id: "english", name: "English Direct & Duels", region: "England", emoji: "🏴", description: "Tempo, physical duels, set pieces, wide service and box presence." },
  { id: "french", name: "French Athletic Development", region: "France", emoji: "🇫🇷", description: "Athletic base, 1v1 domination both ways, technical repetition at speed." },
  { id: "usa", name: "US Pathway", region: "USA", emoji: "🇺🇸", description: "Big rosters, limited practice time, multi-sport athletes, HS intensity." },
];

export type Phase = "attacking" | "defending" | "transition" | "possession" | "set-pieces" | "technical" | "goalkeeping" | "athletic";
export type Complexity = "foundation" | "intermediate" | "advanced";

export const AGE_BANDS = ["U6-U8", "U9-U10", "U11-U12", "U13-U14", "U15-U16", "HS"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

const BAND_FORMAT: Record<AgeBand, string> = {
  "U6-U8": "4v4",
  "U9-U10": "7v7",
  "U11-U12": "9v9",
  "U13-U14": "11v11",
  "U15-U16": "11v11",
  HS: "HS 11v11",
};

const BAND_INDEX: Record<AgeBand, number> = { "U6-U8": 0, "U9-U10": 1, "U11-U12": 2, "U13-U14": 3, "U15-U16": 4, HS: 5 };

interface Topic {
  id: string;
  name: string;
  phase: Phase;
  emoji: string;
  minBand: number; // index into AGE_BANDS
  concept: string; // what this topic trains — drives generation
}

// The topic taxonomy: what youth coaches actually search for.
const TOPICS: Topic[] = [
  // technical
  { id: "ball-mastery", name: "Ball Mastery & First Touch", phase: "technical", emoji: "🎯", minBand: 0, concept: "High-repetition ball manipulation: sole rolls, cuts, turns, receiving with all surfaces, touch away from pressure." },
  { id: "passing-receiving", name: "Passing & Receiving", phase: "technical", emoji: "🔄", minBand: 0, concept: "Pass quality (weight, foot, disguise) and receiving on the back foot/half-turn with pre-scan habits." },
  { id: "1v1-attacking", name: "1v1 Attacking Moves", phase: "technical", emoji: "⚡", minBand: 0, concept: "Beating a defender: feints, changes of speed and direction, protecting the ball, bravery to take players on." },
  { id: "finishing", name: "Finishing & Shooting", phase: "technical", emoji: "🥅", minBand: 0, concept: "Shot technique across finish types: placement vs power, one-touch, off both feet, 1v1 with keeper." },
  { id: "dribbling-carrying", name: "Dribbling & Ball Carrying", phase: "technical", emoji: "🏃", minBand: 0, concept: "Carrying into space at speed, head up, when to dribble vs when to pass." },
  { id: "heading-volleys", name: "Aerial Control & Volleys", phase: "technical", emoji: "🦅", minBand: 2, concept: "Controlling and striking balls out of the air; safe age-appropriate heading introduction per US Soccer guidelines." },
  { id: "weak-foot", name: "Weak Foot Development", phase: "technical", emoji: "🦶", minBand: 1, concept: "Deliberate weak-foot repetition woven into games with constraints and rewards." },
  { id: "scanning", name: "Scanning & Awareness", phase: "technical", emoji: "👀", minBand: 1, concept: "Pre-receive scanning habits, playing what you see, awareness under pressure." },

  // possession
  { id: "rondos", name: "Rondos & Keep-Away", phase: "possession", emoji: "🔁", minBand: 1, concept: "The rondo family: numbers-up keep-away teaching angles, tempo, splits, and pressing resistance." },
  { id: "build-up", name: "Playing Out of the Back", phase: "possession", emoji: "🧱", minBand: 1, concept: "Goal-kick and deep build-up structures: keeper as +1, splitting defenders, breaking the first line." },
  { id: "playing-through-press", name: "Beating a High Press", phase: "possession", emoji: "🌪️", minBand: 2, concept: "Recognizing pressure pictures, third-man bounces, playing through/around/over a press without panic." },
  { id: "midfield-play", name: "Playing Through Midfield", phase: "possession", emoji: "🧭", minBand: 2, concept: "Receiving between lines, half-turns, disguised passes, midfield rotations to escape markers." },
  { id: "switching-play", name: "Switching the Point of Attack", phase: "possession", emoji: "↔️", minBand: 2, concept: "Recognizing overloads, moving the block side to side, the timing and technique of the switch." },
  { id: "possession-games", name: "Possession Games & Overloads", phase: "possession", emoji: "🎲", minBand: 1, concept: "Directional possession with overloads (4v2 to 8v6), keep-to-penetrate decision making." },
  { id: "width-depth", name: "Width, Depth & Support Angles", phase: "possession", emoji: "📐", minBand: 1, concept: "Team shape in possession: stretching the field, support triangles, always two options for the carrier." },

  // attacking
  { id: "combination-play", name: "Combination Play", phase: "attacking", emoji: "🤝", minBand: 2, concept: "Wall passes, third-man runs, overlaps/underlaps, up-back-through patterns to break lines." },
  { id: "crossing-finishing", name: "Crossing & Box Arrivals", phase: "attacking", emoji: "🎯", minBand: 2, concept: "Wide service (early, driven, cutback), near/far-post movement patterns, second-ball reactions." },
  { id: "breaking-low-block", name: "Breaking Down a Low Block", phase: "attacking", emoji: "🔨", minBand: 3, concept: "Patience vs penetration: shifting a packed defense, cutbacks, long shots, disguised passes." },
  { id: "final-third-decisions", name: "Final Third Decision-Making", phase: "attacking", emoji: "🧠", minBand: 2, concept: "Choosing the right final action: shoot, slip, cross, recycle — training pictures under pressure." },
  { id: "movement-off-ball", name: "Movement Off the Ball", phase: "attacking", emoji: "👟", minBand: 2, concept: "Runs that create space: pinning defenders, double movements, blindside runs, arriving late." },
  { id: "wing-play", name: "Wing Play & Isolation", phase: "attacking", emoji: "🪽", minBand: 2, concept: "Creating and winning wide 1v1s, when to stay wide vs come inside, delivering from the isolation." },
  { id: "striker-play", name: "Striker Play & Hold-Up", phase: "attacking", emoji: "9️⃣", minBand: 3, concept: "The #9 toolkit: pinning defenders, hold-up and link play, runs across/behind the line, box finishing." },

  // defending
  { id: "1v1-defending", name: "1v1 Defending", phase: "defending", emoji: "🛡️", minBand: 1, concept: "The duel: approach angle, body shape, jockeying, when to delay vs win the ball." },
  { id: "compact-block", name: "Compactness & Team Shape", phase: "defending", emoji: "🧱", minBand: 2, concept: "Defending as a connected unit: distances, shifting together, protecting central zones." },
  { id: "pressing", name: "Pressing & Triggers", phase: "defending", emoji: "🪤", minBand: 2, concept: "When to jump: triggers (bad touch, back pass, sideline), curved runs, cover shadows, pressing together." },
  { id: "defending-crosses", name: "Defending the Box & Crosses", phase: "defending", emoji: "🥊", minBand: 3, concept: "Box defending: marking vs zone, first contact on crosses, clearing under pressure, cutback denial." },
  { id: "defending-transitions", name: "Stopping Counters (Rest Defense)", phase: "defending", emoji: "🚨", minBand: 3, concept: "Structure behind the ball while attacking, delaying counters, recovery runs, tactical positioning." },
  { id: "back-line", name: "Back-Line Coordination", phase: "defending", emoji: "🔗", minBand: 3, concept: "Line height, stepping and dropping together, offside management, covering the channels." },
  { id: "defending-direct", name: "Defending Direct Play & Second Balls", phase: "defending", emoji: "🪂", minBand: 2, concept: "Winning first and second balls against long-ball teams, screening knock-downs, staying connected." },

  // transition
  { id: "counter-attacking", name: "Counter-Attacking", phase: "transition", emoji: "🚀", minBand: 2, concept: "Win it and go: first pass forward, finishing attacks in under 10 seconds, committing the right numbers." },
  { id: "counter-pressing", name: "Counter-Pressing (5-Second Rule)", phase: "transition", emoji: "⛈️", minBand: 2, concept: "The instant reaction to losing the ball: nearest players hunt, cut the exits, win it back high." },
  { id: "transition-games", name: "Transition Games (Both Ways)", phase: "transition", emoji: "🌊", minBand: 1, concept: "Chaos-with-rules games where the picture flips constantly — attack to defense and back." },

  // set pieces
  { id: "attacking-set-pieces", name: "Attacking Set Pieces", phase: "set-pieces", emoji: "📐", minBand: 2, concept: "Corner and free-kick routines: blocks, screens, deliveries, rehearsed variations." },
  { id: "defending-set-pieces", name: "Defending Set Pieces", phase: "set-pieces", emoji: "🏰", minBand: 2, concept: "Zonal/man/hybrid systems, clearing the first ball, reacting to second phases." },
  { id: "throw-ins-restarts", name: "Throw-Ins & Quick Restarts", phase: "set-pieces", emoji: "🤾", minBand: 1, concept: "Keeping possession from throw-ins, long-throw weapons, catching opponents asleep on restarts." },

  // goalkeeping
  { id: "gk-fundamentals", name: "Goalkeeping Fundamentals", phase: "goalkeeping", emoji: "🧤", minBand: 1, concept: "Set position, handling, footwork, angles, starting positions — integrated with outfield play." },
  { id: "gk-distribution", name: "GK Distribution & Build-Up", phase: "goalkeeping", emoji: "🎯", minBand: 2, concept: "The keeper as +1: short build-up options, driven distribution, launching counters." },

  // athletic
  { id: "speed-agility", name: "Speed & Agility with the Ball", phase: "athletic", emoji: "💨", minBand: 1, concept: "Acceleration, change of direction, and coordination woven into ball work — never bare cones-only running." },
  { id: "small-sided-competition", name: "Small-Sided Game Night", phase: "athletic", emoji: "🏟️", minBand: 0, concept: "A full session of competitive small-sided games with rotating constraints — maximum touches, maximum fun." },
  { id: "tryout-evaluation", name: "Tryout / Evaluation Session", phase: "athletic", emoji: "📋", minBand: 1, concept: "Fair-look session design: stations and games that let every player show ability in every phase." },
];

const COMPLEXITY_LABEL: Record<Complexity, { word: string; blurb: string }> = {
  foundation: { word: "Foundations", blurb: "Core habits and simple pictures — perfect first exposure to the topic" },
  intermediate: { word: "Progressions", blurb: "Adds pressure, decisions, and game-realistic pictures" },
  advanced: { word: "Advanced", blurb: "Full tactical detail, opposition pictures, and position-specific roles" },
};

// complexity availability by band index: U6-U8 foundation only; U9-U10 +intermediate; U11+ all
function complexitiesFor(bandIdx: number): Complexity[] {
  if (bandIdx === 0) return ["foundation"];
  if (bandIdx === 1) return ["foundation", "intermediate"];
  return ["foundation", "intermediate", "advanced"];
}

export interface SessionTemplate {
  id: string;
  topic: string;
  topicName: string;
  phase: Phase;
  emoji: string;
  ageBand: AgeBand;
  complexity: Complexity;
  format: string;
  title: string;
  theme: string;
  description: string;
  concept: string;
}

function buildCatalog(): SessionTemplate[] {
  const out: SessionTemplate[] = [];
  for (const t of TOPICS) {
    for (const band of AGE_BANDS) {
      const bi = BAND_INDEX[band];
      if (bi < t.minBand) continue;
      for (const cx of complexitiesFor(bi)) {
        const c = COMPLEXITY_LABEL[cx];
        out.push({
          id: `${t.id}--${band.toLowerCase().replace(/[^a-z0-9]+/g, "")}--${cx}`,
          topic: t.id,
          topicName: t.name,
          phase: t.phase,
          emoji: t.emoji,
          ageBand: band,
          complexity: cx,
          format: BAND_FORMAT[band],
          title: `${t.name}: ${c.word} (${band})`,
          theme: t.name,
          description: `${c.blurb}. ${t.concept}`,
          concept: t.concept,
        });
      }
    }
  }
  return out;
}

export const SESSION_TEMPLATES: SessionTemplate[] = buildCatalog();

export function getTemplate(id: string): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((t) => t.id === id);
}

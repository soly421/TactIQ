// The Session Library: a programmatic catalog organized the way coaches actually
// search — by topic, phase, age band, and complexity. Each template is an index
// entry; unlocking it generates the full session live, adapted to the coach's
// team, so every unlock is unique. Schools of thought remain as an optional
// generation flavor (used by Session Studio).
import { SIGNATURE_EXERCISES } from "./exercises.js";

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
  { id: "ball-mastery", name: "Ball Mastery & First Touch", phase: "technical", emoji: "🎯", minBand: 0, concept: "High-repetition ball manipulation: sole rolls, cuts, turns, receiving with all surfaces, touch away from pressure. Signature exercises: the Brazilian Warm-Up aka 'Brazilians' (outside players feed rotating middle players — one-touch, two-touch, volleys, half-turn dribble); Coerver-style turn repertoire lines (Cruyff turn, chop, pull-back, Zico turn, inside/outside cut) with a burst of pace after every turn; 3-person turn sequence where the passer becomes the passive defender." },
  { id: "passing-receiving", name: "Passing & Receiving", phase: "technical", emoji: "🔄", minBand: 0, concept: "Pass quality (weight, foot, disguise) and receiving on the back foot/half-turn with pre-scan habits. Signature exercises: battle pass (first group to 20, first touch must stay in the box); diamond passing with 4 staged progressions (straight → double pass → double pass + 1-2 → turn-and-play); square pass with 3 progressions treating the cone as a defender; diagonal passing circuit ('if the entry ball is poor, take two touches'); two-ball phased patterns building wide → middle → in behind → to goal." },
  { id: "1v1-attacking", name: "1v1 Attacking Moves", phase: "technical", emoji: "⚡", minBand: 0, concept: "Beating a defender: feints, changes of speed and direction, protecting the ball, bravery to take players on. Signature exercises: the Coerver 1v1 move canon on mannequins/cones (scissors, V-move/Puskás, the Matthews, Maradona spin, elastico, step-over-turn) executed at pace with acceleration after the move; sprint-then-1v1 to goal ('if you're ahead of the defender, take the early chance'); three-grid 1v1s where the defender counters into a mini goal." },
  { id: "finishing", name: "Finishing & Shooting", phase: "technical", emoji: "🥅", minBand: 0, concept: "Shot technique across finish types: placement vs power, one-touch, off both feet, 1v1 with keeper. Signature exercises: 3-phase finishing (1v1 to mini goal → winner earns 2v1 at the big net → 2v2 back the other way); L-sequence one-touch layoffs at tempo; sprint finishing with pass-and-move stations; arc finishing (3v3 inside the arc with live outside players you swap with — no long shots, high-percentage only); Y pass/dribble pattern with slip passes and overlaps off both sides." },
  { id: "dribbling-carrying", name: "Dribbling & Ball Carrying", phase: "technical", emoji: "🏃", minBand: 0, concept: "Carrying into space at speed, head up, when to dribble vs when to pass. Signature exercises: cone-gate game (through as many gates as possible in 45s while the coach blocks gates to force direction changes); Barcelona academy dribbling (four groups attack a central cone with a specified move, faking one way going the other); dribbling cone races with both-feet variations; pass-dribble-tag in 10x10 grids; 4v2 dribble-to-rondo (defenders knock balls out, losers become passing options)." },
  { id: "heading-volleys", name: "Aerial Control & Volleys", phase: "technical", emoji: "🦅", minBand: 2, concept: "Controlling and striking balls out of the air; safe age-appropriate heading introduction per US Soccer guidelines." },
  { id: "weak-foot", name: "Weak Foot Development", phase: "technical", emoji: "🦶", minBand: 1, concept: "Deliberate weak-foot repetition woven into games with constraints and rewards." },
  { id: "scanning", name: "Scanning & Awareness", phase: "technical", emoji: "👀", minBand: 1, concept: "Pre-receive scanning habits, playing what you see, awareness under pressure." },

  // possession
  { id: "rondos", name: "Rondos & Keep-Away", phase: "possession", emoji: "🔁", minBand: 1, concept: "The rondo family — the Barcelona/Ajax lineage exercise (devised by Laureano Ruiz, spread by Cruyff): numbers-up keep-away teaching angles, tempo, splits, and pressing resistance. Signature exercises: 5v2 in 12x12 with the defender-swap rule (if defenders win it within 5 passes, BOTH rotate out); 6v3 three-team rondo (your color loses it, your color defends); competitive rondo (6 passes earns a strike on a mini goal, scorer then shoots on the big goal, race to 3); 5v2 double grid (6 passes then transfer to the partner grid); rondo-transfer variations with pressing pairs and a no-square-pass rule." },
  { id: "build-up", name: "Playing Out of the Back", phase: "possession", emoji: "🧱", minBand: 1, concept: "Goal-kick and deep build-up structures: keeper as +1, splitting defenders, breaking the first line." },
  { id: "playing-through-press", name: "Beating a High Press", phase: "possession", emoji: "🌪️", minBand: 2, concept: "Recognizing pressure pictures, third-man bounces, playing through/around/over a press without panic." },
  { id: "midfield-play", name: "Playing Through Midfield", phase: "possession", emoji: "🧭", minBand: 2, concept: "Receiving between lines, half-turns, disguised passes, midfield rotations to escape markers." },
  { id: "switching-play", name: "Switching the Point of Attack", phase: "possession", emoji: "↔️", minBand: 2, concept: "Recognizing overloads, moving the block side to side, the timing and technique of the switch. Signature exercises: rondo into switch-of-play (defenders win it in the grid, find their 6, who releases the opposite winger to drive and box-cross — 'space does not score goals, mark your man'); 5v2 double grid transfers after 6 passes; diagonal passing circuits ('diagonal passes break lines — no square passes')." },
  { id: "possession-games", name: "Possession Games & Overloads", phase: "possession", emoji: "🎲", minBand: 1, concept: "Directional possession with overloads (4v2 to 8v6), keep-to-penetrate decision making. Signature exercises: 4v4+2 wide neutrals at 2 touches; 6v6+6 three-mini-goal game (on regain you MUST play out to the 1-touch neutral team); 4-corner possession (connect your corner to the opposite one); 6v2 with 3 goals (10 passes = 1 point, defenders counter into small goals for 2); Villarreal-style 8v8+4 positional possession with neutrals occupying real positions (4, 7, 9, 11); 7v5 positional game with players locked to grids until regain; 8v3 box game." },
  { id: "width-depth", name: "Width, Depth & Support Angles", phase: "possession", emoji: "📐", minBand: 1, concept: "Team shape in possession: stretching the field, support triangles, always two options for the carrier." },

  // attacking
  { id: "combination-play", name: "Combination Play", phase: "attacking", emoji: "🤝", minBand: 2, concept: "Wall passes, third-man runs, overlaps/underlaps, up-back-through patterns to break lines. Signature exercises: up-back-through (entry to the 9, set to the 10, through ball for the winger, cross to box arrivals); 5-player pattern CB → CM → winger (touch, turn, play negative) → forward → winger box arrival; formation-specific patterns to goal for 4-3-3/4-2-3-1 with 1-2s, double passes and overlaps; penalty-box entry chains (2v1 → 2v1 → 3v2 with no passing back once entered); inverted-winger patterns with overlapping backs — dribble, drive, play or shoot." },
  { id: "crossing-finishing", name: "Crossing & Box Arrivals", phase: "attacking", emoji: "🎯", minBand: 2, concept: "Wide service (early, driven, cutback), near/far-post movement patterns, second-ball reactions. Signature exercises: overload crossing (3v2 to goal, then attackers retreat and attack a cross from the right, then the left); 3-man cross-and-finish with varied deliveries (chipped, driven low) and an optional defender; winger 1-2 with the forward into a box cross; 4-phase finishing the attack by position numbers (wide right 7/8/9 v 3/5, wide left 10/11/9 v 4/2, central, then whole front five v back four — entry always from the 6, goals only inside the area)." },
  { id: "breaking-low-block", name: "Breaking Down a Low Block", phase: "attacking", emoji: "🔨", minBand: 3, concept: "Patience vs penetration: shifting a packed defense, cutbacks, long shots, disguised passes." },
  { id: "final-third-decisions", name: "Final Third Decision-Making", phase: "attacking", emoji: "🧠", minBand: 2, concept: "Choosing the right final action: shoot, slip, cross, recycle — training pictures under pressure." },
  { id: "movement-off-ball", name: "Movement Off the Ball", phase: "attacking", emoji: "👟", minBand: 2, concept: "Runs that create space: pinning defenders, double movements, blindside runs, arriving late. Signature exercises: 3v3+2 playing-in-behind with an offside line ('the run dictates the pass'); 6v6 playing-in-behind on a narrowed field so wingers learn the half-space; through-ball timing patterns (check short, spin in behind — weight the pass so the forward strikes first time); delayed 4v4-to-6v4 with whistle-triggered waves and live offside." },
  { id: "wing-play", name: "Wing Play & Isolation", phase: "attacking", emoji: "🪽", minBand: 2, concept: "Creating and winning wide 1v1s, when to stay wide vs come inside, delivering from the isolation." },
  { id: "striker-play", name: "Striker Play & Hold-Up", phase: "attacking", emoji: "9️⃣", minBand: 3, concept: "The #9 toolkit: pinning defenders, hold-up and link play, runs across/behind the line, box finishing." },

  // defending
  { id: "1v1-defending", name: "1v1 Defending", phase: "defending", emoji: "🛡️", minBand: 1, concept: "The duel: approach angle, body shape, jockeying, when to delay vs win the ball. Signature exercises: 1v1 with two cone gates (close fast, get low in an athletic stance, short steps on approach, never flat-footed, never give up when beaten); the Club Brugge 1v1 (pass, then sprint around the grid to defend the receiver — a staple from Belgium's top academy); knock-the-ball-off-the-cone 1v1 where the defender protects a target; 4v4 number-call defending (stay in your lane, don't cross over, communicate)." },
  { id: "compact-block", name: "Compactness & Team Shape", phase: "defending", emoji: "🧱", minBand: 2, concept: "Defending as a connected unit: distances, shifting together, protecting central zones. Signature exercises: pressure–cover–balance blocks (the English FA's core defending principles) — 6v4 and 7v4 where the defending line denies entry passes to forwards behind them ('do NOT get beat down the middle', force play wide, high intensity); early pressure/cover/balance 4v4+1 target forward ('the right player steps to the ball'); 7v5 recover-and-delay after the possession team completes 7 passes; 6v6 with counter goals played as a defensive patience exercise." },
  { id: "pressing", name: "Pressing & Triggers", phase: "defending", emoji: "🪤", minBand: 2, concept: "When to jump: triggers (bad touch, back pass, sideline), curved runs, cover shadows, pressing together." },
  { id: "defending-crosses", name: "Defending the Box & Crosses", phase: "defending", emoji: "🥊", minBand: 3, concept: "Box defending: marking vs zone, first contact on crosses, clearing under pressure, cutback denial. Signature exercises: defending the cross and second phase (2v1 wide → cross → coach immediately feeds a 4v2 second ball — 'don't switch off between phases'); aerial knock-down game (back four connect 6 passes in their box then launch it long; opponents clear at all costs, dropped balls become 6v4); 4v2+2 counter-attack defending (CBs contain and delay while two defenders recover)." },
  { id: "defending-transitions", name: "Stopping Counters (Rest Defense)", phase: "defending", emoji: "🚨", minBand: 3, concept: "Structure behind the ball while attacking, delaying counters, recovery runs, tactical positioning." },
  { id: "back-line", name: "Back-Line Coordination", phase: "defending", emoji: "🔗", minBand: 3, concept: "Line height, stepping and dropping together, offside management, covering the channels." },
  { id: "defending-direct", name: "Defending Direct Play & Second Balls", phase: "defending", emoji: "🪂", minBand: 2, concept: "Winning first and second balls against long-ball teams, screening knock-downs, staying connected." },

  // transition
  { id: "counter-attacking", name: "Counter-Attacking", phase: "transition", emoji: "🚀", minBand: 2, concept: "Win it and go: first pass forward, finishing attacks in under 10 seconds, committing the right numbers. Signature exercises: 2v1-to-4v2 driving to goal (beat the defender wide, then the beaten back sprints to recover); wide combination into 3v2 transition; wave game building 2v0 → 3v2 → 3v4 → 6v4 → 6v8 → 8v8 with width arriving mid-sequence; 4v2 crossing transition off keeper throws (all-out sprints, doubles as conditioning); 5v3 to mini goals with instant role flips." },
  { id: "counter-pressing", name: "Counter-Pressing (5-Second Rule)", phase: "transition", emoji: "⛈️", minBand: 2, concept: "The instant reaction to losing the ball: nearest players hunt, cut the exits, win it back high. Signature exercises: the gegenpressing square (German school) — 4v2 in the small square, lose it, expand to 6v4 and hunt it back instantly (the transitional moment IS the exercise); 3-team 6v3 where the team that loses it defends; 4v4+3 with the 6/8 as pivot ('head on a swivel'); 8v4+1 grid-to-grid possession with a 2-touch link player." },
  { id: "transition-games", name: "Transition Games (Both Ways)", phase: "transition", emoji: "🌊", minBand: 1, concept: "Chaos-with-rules games where the picture flips constantly — attack to defense and back. Signature exercises: 3v3 continuous (score and you keep attacking; defenders who win it counter into mini goals to become attackers); call-off game (coach calls a letter/number, that player sprints off as a new one enters — both teams must react); Funiño-style four-goal games (Horst Wein's method — two goals to attack, two to defend, constant scanning) with full-team swaps when the ball dies; delayed 4v4-to-6v4 with whistle-triggered attacking and defending waves." },

  // set pieces
  { id: "attacking-set-pieces", name: "Attacking Set Pieces", phase: "set-pieces", emoji: "📐", minBand: 2, concept: "Corner and free-kick routines: blocks, screens, deliveries, rehearsed variations." },
  { id: "defending-set-pieces", name: "Defending Set Pieces", phase: "set-pieces", emoji: "🏰", minBand: 2, concept: "Zonal/man/hybrid systems, clearing the first ball, reacting to second phases." },
  { id: "throw-ins-restarts", name: "Throw-Ins & Quick Restarts", phase: "set-pieces", emoji: "🤾", minBand: 1, concept: "Keeping possession from throw-ins, long-throw weapons, catching opponents asleep on restarts." },

  // goalkeeping
  { id: "gk-fundamentals", name: "Goalkeeping Fundamentals", phase: "goalkeeping", emoji: "🧤", minBand: 1, concept: "Set position, handling, footwork, angles, starting positions — integrated with outfield play." },
  { id: "gk-distribution", name: "GK Distribution & Build-Up", phase: "goalkeeping", emoji: "🎯", minBand: 2, concept: "The keeper as +1: short build-up options, driven distribution, launching counters." },

  // athletic
  { id: "speed-agility", name: "Speed & Agility with the Ball", phase: "athletic", emoji: "💨", minBand: 1, concept: "Acceleration, change of direction, and coordination woven into ball work — never bare cones-only running. For U13+ only, proven conditioning protocols: the Manchester United '15-15' shuttle protocol (18-yard box to midfield and back, 15s work / 15s rest, build 6→8 minutes over weeks); 120-yard shuffle (10/20/30 yards and back under 25s, rest the remainder of the minute, 6 reps); zig-zag agility courses. Younger groups get speed work only through games and races with the ball." },
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
  collection: "signature" | "blueprint";
  tradition?: string;
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
          collection: "blueprint",
        });
      }
    }
  }
  return out;
}

// The signature catalog: named exercises from the zone curriculum and academy
// traditions worldwide, one library card per suitable age band.
function buildSignatureCatalog(): SessionTemplate[] {
  const out: SessionTemplate[] = [];
  for (const e of SIGNATURE_EXERCISES) {
    for (const band of e.ageBands) {
      const bi = BAND_INDEX[band as AgeBand];
      if (bi === undefined) continue;
      out.push({
        id: `${e.id}--${band.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
        topic: e.id,
        topicName: e.name,
        phase: e.phase as Phase,
        emoji: e.emoji,
        ageBand: band as AgeBand,
        complexity: e.complexity as Complexity,
        format: e.format === "any" ? BAND_FORMAT[band as AgeBand] : e.format,
        title: `${e.name} (${band})`,
        theme: e.name,
        description: e.organization,
        concept: `${e.organization} Coaching points: ${e.coachingPoints.join("; ")}.`,
        collection: "signature",
        tradition: e.tradition,
      });
    }
  }
  return out;
}

export const SESSION_TEMPLATES: SessionTemplate[] = [...buildSignatureCatalog(), ...buildCatalog()];

export function getTemplate(id: string): SessionTemplate | undefined {
  return SESSION_TEMPLATES.find((t) => t.id === id);
}

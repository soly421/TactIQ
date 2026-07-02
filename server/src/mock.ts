// Demo-mode responses used when ANTHROPIC_API_KEY is not set, so the app can be
// explored end-to-end without live model calls.

export const MOCK_SESSION_PLAN = {
  title: "Playing Through the Thirds",
  ageGroup: "U12",
  durationMinutes: 75,
  theme: "Build-up play: breaking the first line of pressure",
  objectives: [
    "Receive on the half-turn between lines",
    "Recognize when to play through, around, or over pressure",
    "Support angles: always give the ball carrier two options",
  ],
  equipment: ["20 cones", "12 balls", "8 bibs (2 colors)", "4 mini-goals"],
  drills: [
    {
      name: "Arrival Rondo 4v1",
      phase: "warmup",
      durationMinutes: 10,
      area: "8x8 yards per group",
      organization:
        "Groups of 5 as players arrive. Four outside players keep the ball off one defender. Two-touch limit. Defender swaps on interception.",
      coachingPoints: ["Open body shape before receiving", "Pass to the correct foot", "Move after passing"],
      progressions: ["One-touch for advanced groups", "5v2 with a split-pass point"],
      diagram: {
        attackers: [
          { x: 50, y: 8 },
          { x: 92, y: 50 },
          { x: 50, y: 92 },
          { x: 8, y: 50 },
        ],
        defenders: [{ x: 50, y: 50 }],
        neutrals: [],
        cones: [
          { x: 15, y: 15 },
          { x: 85, y: 15 },
          { x: 85, y: 85 },
          { x: 15, y: 85 },
        ],
        balls: [{ x: 50, y: 14 }],
        goals: [],
        movements: [
          { from: { x: 50, y: 8 }, to: { x: 92, y: 50 }, kind: "pass" },
          { from: { x: 92, y: 50 }, to: { x: 50, y: 92 }, kind: "pass" },
        ],
      },
    },
    {
      name: "Through the Gates",
      phase: "technical",
      durationMinutes: 15,
      area: "30x25 yards",
      organization:
        "Pairs pass through scattered cone gates. One point per gate. On 'switch', find a NEW gate — heads up, scan before receiving.",
      coachingPoints: ["Scan before the ball arrives", "First touch through the gate", "Disguise the pass"],
      progressions: ["Add two floating defenders who can block gates", "Limit to weak foot"],
      diagram: {
        attackers: [
          { x: 20, y: 30 },
          { x: 45, y: 55 },
          { x: 70, y: 25 },
          { x: 80, y: 70 },
        ],
        defenders: [],
        neutrals: [],
        cones: [
          { x: 32, y: 40 },
          { x: 38, y: 44 },
          { x: 60, y: 60 },
          { x: 66, y: 56 },
          { x: 58, y: 20 },
          { x: 64, y: 24 },
        ],
        balls: [{ x: 24, y: 33 }],
        goals: [],
        movements: [{ from: { x: 20, y: 30 }, to: { x: 45, y: 55 }, kind: "pass" }],
      },
    },
    {
      name: "3-Zone Build-Up Game",
      phase: "skill-under-pressure",
      durationMinutes: 20,
      area: "40x30 yards in three zones",
      organization:
        "6v6. Pitch split into thirds. Build from the back zone: ball must touch a midfielder in the middle zone before entering the final zone. Defenders may send one presser into the build zone.",
      coachingPoints: [
        "Split the center-backs, GK becomes an option",
        "Midfielder receives side-on between defenders",
        "Play forward on the first opportunity",
      ],
      progressions: ["Allow two pressers", "Remove zone restriction on a 10-pass streak"],
      diagram: {
        attackers: [
          { x: 30, y: 85 },
          { x: 70, y: 85 },
          { x: 50, y: 60 },
          { x: 25, y: 45 },
          { x: 75, y: 45 },
          { x: 50, y: 25 },
        ],
        defenders: [
          { x: 50, y: 72 },
          { x: 35, y: 50 },
          { x: 65, y: 50 },
          { x: 40, y: 25 },
          { x: 60, y: 25 },
          { x: 50, y: 10 },
        ],
        neutrals: [],
        cones: [
          { x: 5, y: 66 },
          { x: 95, y: 66 },
          { x: 5, y: 33 },
          { x: 95, y: 33 },
        ],
        balls: [{ x: 33, y: 84 }],
        goals: [
          { x: 50, y: 2 },
          { x: 50, y: 98 },
        ],
        movements: [
          { from: { x: 30, y: 85 }, to: { x: 50, y: 60 }, kind: "pass" },
          { from: { x: 50, y: 60 }, to: { x: 50, y: 25 }, kind: "pass" },
          { from: { x: 25, y: 45 }, to: { x: 30, y: 30 }, kind: "run" },
        ],
      },
    },
    {
      name: "Free Play",
      phase: "free-play",
      durationMinutes: 15,
      area: "40x30 yards",
      organization: "6v6 free game. Let them play — praise brave forward passes when they happen naturally.",
      coachingPoints: ["Observe only", "Individual praise at natural stoppages"],
      progressions: [],
      diagram: {
        attackers: [
          { x: 30, y: 80 },
          { x: 70, y: 80 },
          { x: 50, y: 55 },
          { x: 30, y: 35 },
          { x: 70, y: 35 },
          { x: 50, y: 15 },
        ],
        defenders: [
          { x: 30, y: 20 },
          { x: 70, y: 20 },
          { x: 50, y: 45 },
          { x: 30, y: 65 },
          { x: 70, y: 65 },
          { x: 50, y: 85 },
        ],
        neutrals: [],
        cones: [],
        balls: [{ x: 50, y: 50 }],
        goals: [
          { x: 50, y: 2 },
          { x: 50, y: 98 },
        ],
        movements: [],
      },
    },
  ],
  coachReminders: [
    "U12s: keep interventions under 30 seconds — coach through questions",
    "Rotate positions so everyone experiences build-up roles",
    "Success = brave attempts, not just completed passes",
  ],
};

export const MOCK_FORMATION = {
  recommendedFormation: "3-2-3 (9v9)",
  formationRationale:
    "The 3-2-3 gives natural triangles on both sides, maps directly onto a 4-3-3 at 11v11, and always provides a spare player in build-up against the common 3-3-2 press.",
  positions: [
    { label: "GK", role: "Sweeper-keeper", x: 50, y: 92, keyInstructions: ["Split the back three when we have the ball", "Play short unless pressed"], suggestedPlayer: "" },
    { label: "LCB", role: "Wide builder", x: 25, y: 75, keyInstructions: ["Step into midfield when free", "Cover the left channel"], suggestedPlayer: "" },
    { label: "CB", role: "Organizer", x: 50, y: 78, keyInstructions: ["Talk constantly", "First option from the GK"], suggestedPlayer: "" },
    { label: "RCB", role: "Wide builder", x: 75, y: 75, keyInstructions: ["Step into midfield when free", "Cover the right channel"], suggestedPlayer: "" },
    { label: "LCM", role: "Connector", x: 38, y: 55, keyInstructions: ["Receive side-on", "Find the wingers early"], suggestedPlayer: "" },
    { label: "RCM", role: "Connector", x: 62, y: 55, keyInstructions: ["Receive side-on", "Arrive late in the box"], suggestedPlayer: "" },
    { label: "LW", role: "Width provider", x: 15, y: 30, keyInstructions: ["Stay wide to stretch the pitch", "1v1 when isolated"], suggestedPlayer: "" },
    { label: "ST", role: "Reference striker", x: 50, y: 18, keyInstructions: ["Pin the last defender", "First presser out of possession"], suggestedPlayer: "" },
    { label: "RW", role: "Width provider", x: 85, y: 30, keyInstructions: ["Stay wide to stretch the pitch", "Back-post runs on far-side crosses"], suggestedPlayer: "" },
  ],
  inPossession: [
    "Back three splits, GK joins build-up for a 4v2 against most presses",
    "Wingers hug the touchline to create central space for the two midfielders",
    "Striker pins the last line so midfielders can receive between lines",
  ],
  outOfPossession: [
    "Front three press in an arc, showing play to one side",
    "Midfield two protect the central lane — never both pulled to the ball side",
    "Back three stay connected within 25 yards",
  ],
  transitions: [
    "On winning it: first look forward to the striker's feet",
    "On losing it: nearest two counter-press for 5 seconds, rest recover central",
  ],
  strengths: ["Spare man in build-up", "Natural wide triangles", "Direct mapping to 11v11 4-3-3"],
  vulnerabilities: [
    "Channels beside the back three against fast wingers",
    "Midfield two can be overloaded by a diamond",
  ],
  trainingPriorities: [
    "Back-three shifting and channel cover",
    "Midfield receiving on the half-turn under pressure",
    "Arc pressing patterns for the front three",
  ],
};

export const MOCK_CHAT_REPLY =
  "[Demo mode — set ANTHROPIC_API_KEY for live coaching conversations]\n\nGood question, coach. Before I give you an answer, tell me three things: what age group are we working with, what shape do you currently play, and where exactly is the problem showing up — build-up, middle third, or final third? The answer changes completely depending on those details. A U10 team losing the ball in build-up needs a different picture than a U15 team that can't break a low block.";

export const MOCK_GUIDANCE =
  "## Demo mode\n\nSet `ANTHROPIC_API_KEY` on the server to get live, customized coaching guidance.\n\n### What you'd get here\nA structured answer tailored to your age group, team level, and the problem you described — covering the tactical picture, 2-3 training activities to fix it, and what to say to your players (and how to say it for their age).";

export const MOCK_GAME_PLAN = {
  matchTitle: "vs Demo United — League Match",
  keysToTheGame: [
    "Win the midfield duel: their #8 starts every attack",
    "Beat their high line with early balls behind",
    "Own restarts — they concede from corners",
  ],
  inPossession: ["Build 2+1 with the keeper", "Wingers stay high and wide to stretch their back three", "Look for the striker's runs behind on the first touch forward"],
  outOfPossession: ["Mid-block, press on their back-pass trigger", "Deny the switch: press the ball-side, screen the far side", "Recover central first, then out"],
  setPieces: ["Corners: near-post overload with a back-post runner", "Defending: zonal front post, man on their tall #5", "Quick free kicks whenever their keeper is chatting"],
  matchups: [
    { zone: "Their left wing (fast #11)", plan: "Fullback drops earlier; winger tracks the overlap", exploit: false },
    { zone: "Behind their fullbacks", plan: "Early diagonals for our wingers to run onto", exploit: true },
  ],
  firstTenMinutes: ["High energy, simple passes, no risks in our third", "First restart: try corner routine #1", "Test their keeper with any shot from the D"],
  pregameTalk: "Remember how hard we worked on playing forward this week? Today's the day it shows. Be brave with the ball, be first to every loose one, and pick each other up after mistakes. Have FUN out there — that's an order.",
  benchNotes: ["Rotate wingers every 12-15 min to keep pace advantage", "Save your most composed defender for the last 10 if protecting a lead"],
  ifChasing: ["Push a mid higher into a 2-3-2 press", "Wingers pinch inside; fullbacks provide width", "Fast restarts everywhere"],
  ifProtecting: ["Drop the block 10 yards, stay compact", "Striker stays high as the out-ball", "Use every legal second on restarts"],
};

export const MOCK_LIVE_REPLY =
  "[Demo mode]\n\n**Down 1-0 vs a low block — three moves:**\n1. Switch faster: two-touch max in midfield, make their block slide until it tears.\n2. Push your fullbacks past their wingers — force their block to widen, opening the D.\n3. Next corner: run routine #1, their keeper stays on his line.\n\nStay calm on the sideline — the kids play like you look.";

export const MOCK_DEBRIEF =
  "## What the Data Says\n[Demo mode — set ANTHROPIC_API_KEY for live analysis]\nYour numbers suggest a game you controlled but didn't finish: plenty of territory, low chance quality.\n\n## What Went Well\n- Build-up under pressure held up\n- Defensive shape between boxes\n\n## Fix This Week\n- Final-third decisions: cutback vs cross\n- Box arrivals: nobody attacking the near post\n\n## Player Messages\n- Keeper: brilliant distribution, keep it\n- Striker: your movement created everything, goals will come\n\n## Next Session Focus\nFinishing from cutbacks — the Library's \"Put It In The Mixer\" adapted to your age group.";

export const MOCK_SEASON_PLAN = {
  title: "Fall Season: Brave On The Ball",
  ageGroup: "U10",
  weeks: [
    { week: 1, block: "Foundation", theme: "Ball mastery & 1v1 bravery", objectives: ["High touch volume", "Try skills without fear"], sessionIdeas: ["Futsal-style tight-space circuits", "1v1 arenas with skill bonuses"], gameFocus: "Praise every brave dribble, ignore the outcome" },
    { week: 2, block: "Foundation", theme: "First touch & scanning", objectives: ["Touch away from pressure", "Look before receiving"], sessionIdeas: ["Gate passing with scans", "4v1 rondo ladder"], gameFocus: "Count scans out loud from the sideline" },
    { week: 3, block: "In possession", theme: "Playing out from the back", objectives: ["Keeper as +1", "Split defenders receive wide"], sessionIdeas: ["3-zone build-up game"], gameFocus: "Goal kicks: play short every time, whatever happens" },
    { week: 4, block: "In possession", theme: "Support angles", objectives: ["Two options for every carrier"], sessionIdeas: ["Triangle keep-away", "3v1 to 3v2 progression"], gameFocus: "Freeze one moment per half to show support shape" },
  ],
  principles: ["Development over results all season", "Every player plays every position", "Success = brave attempts"],
  checkpoints: ["Week 4: players ask to play out short on goal kicks", "Week 8: first-touch turns appear in games unprompted", "Week 12: team recognizably plays through thirds"],
};

export const MOCK_FILM =
  "## What I See\n[Demo mode — set ANTHROPIC_API_KEY for live film analysis]\n- **0:02** — Back line is flat and 25 yards from the midfield: two units, no connection.\n- **0:08** — Ball-side pressure arrives but the far-side winger is ball-watching; the switch is wide open.\n- **0:14** — After the turnover, three players chase the same ball — no rest-defense triangle.\n\n## The Problem\nYour shape stretches the moment the ball moves — distances between lines grow instead of sliding together.\n\n## Fix It\nOne picture: \"move like you're connected by rope.\" When the ball shifts, the WHOLE block shifts within two seconds.\n\n## Train It\n- Shadow-play shifting (no opponent): back four + mids slide on the coach's pointer, 8 min\n- 8v8 zone game: goals only count if the whole team is inside the ball-side half — forces collective sliding.";

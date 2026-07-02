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
    { label: "GK", role: "Sweeper-keeper", x: 50, y: 92, keyInstructions: ["Split the back three when we have the ball", "Play short unless pressed"] },
    { label: "LCB", role: "Wide builder", x: 25, y: 75, keyInstructions: ["Step into midfield when free", "Cover the left channel"] },
    { label: "CB", role: "Organizer", x: 50, y: 78, keyInstructions: ["Talk constantly", "First option from the GK"] },
    { label: "RCB", role: "Wide builder", x: 75, y: 75, keyInstructions: ["Step into midfield when free", "Cover the right channel"] },
    { label: "LCM", role: "Connector", x: 38, y: 55, keyInstructions: ["Receive side-on", "Find the wingers early"] },
    { label: "RCM", role: "Connector", x: 62, y: 55, keyInstructions: ["Receive side-on", "Arrive late in the box"] },
    { label: "LW", role: "Width provider", x: 15, y: 30, keyInstructions: ["Stay wide to stretch the pitch", "1v1 when isolated"] },
    { label: "ST", role: "Reference striker", x: 50, y: 18, keyInstructions: ["Pin the last defender", "First presser out of possession"] },
    { label: "RW", role: "Width provider", x: 85, y: 30, keyInstructions: ["Stay wide to stretch the pitch", "Back-post runs on far-side crosses"] },
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

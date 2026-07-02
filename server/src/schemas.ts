// JSON Schemas for structured outputs. Structured-output limitations apply:
// every object needs additionalProperties:false, no numeric min/max constraints.

const point = {
  type: "object",
  properties: {
    x: { type: "number", description: "0-100, left to right across the pitch diagram" },
    y: { type: "number", description: "0-100, top to bottom of the pitch diagram" },
  },
  required: ["x", "y"],
  additionalProperties: false,
} as const;

export const SESSION_PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    ageGroup: { type: "string" },
    durationMinutes: { type: "integer" },
    theme: { type: "string", description: "The session's tactical/technical theme" },
    objectives: { type: "array", items: { type: "string" } },
    equipment: { type: "array", items: { type: "string" } },
    drills: {
      type: "array",
      description: "3-5 progressive activities following arrival -> technical -> pressure -> game structure",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          phase: {
            type: "string",
            enum: ["warmup", "technical", "skill-under-pressure", "conditioned-game", "free-play"],
          },
          durationMinutes: { type: "integer" },
          area: { type: "string", description: "e.g. '25x20 yards'" },
          organization: { type: "string", description: "Setup and how the activity works" },
          coachingPoints: { type: "array", items: { type: "string" } },
          progressions: { type: "array", items: { type: "string" } },
          diagram: {
            type: "object",
            description: "Positions on a 100x100 grid representing the drill area for visualization",
            properties: {
              attackers: { type: "array", items: point },
              defenders: { type: "array", items: point },
              neutrals: { type: "array", items: point },
              cones: { type: "array", items: point },
              balls: { type: "array", items: point },
              goals: {
                type: "array",
                description: "Center point of each goal (mini-goal or full goal)",
                items: point,
              },
              movements: {
                type: "array",
                description: "Arrows showing key runs, passes, or dribbles",
                items: {
                  type: "object",
                  properties: {
                    from: point,
                    to: point,
                    kind: { type: "string", enum: ["run", "pass", "dribble"] },
                  },
                  required: ["from", "to", "kind"],
                  additionalProperties: false,
                },
              },
            },
            required: ["attackers", "defenders", "neutrals", "cones", "balls", "goals", "movements"],
            additionalProperties: false,
          },
        },
        required: [
          "name",
          "phase",
          "durationMinutes",
          "area",
          "organization",
          "coachingPoints",
          "progressions",
          "diagram",
        ],
        additionalProperties: false,
      },
    },
    coachReminders: {
      type: "array",
      items: { type: "string" },
      description: "Age-appropriate reminders (welfare, tone, intervention style)",
    },
  },
  required: [
    "title",
    "ageGroup",
    "durationMinutes",
    "theme",
    "objectives",
    "equipment",
    "drills",
    "coachReminders",
  ],
  additionalProperties: false,
} as const;

export const FORMATION_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    recommendedFormation: { type: "string", description: "e.g. '4-3-3' or '3-2-3' for 9v9" },
    formationRationale: { type: "string" },
    positions: {
      type: "array",
      description: "One entry per position in the recommended formation, on a 100x100 grid (attacking toward y=0)",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short label, e.g. 'GK', 'RB', 'CM'" },
          role: { type: "string", description: "Role description, e.g. 'Inverted full-back'" },
          x: { type: "number" },
          y: { type: "number" },
          keyInstructions: { type: "array", items: { type: "string" } },
          suggestedPlayer: { type: "string", description: "Name from the coach's roster who fits this position best, or empty string if no roster" },
        },
        required: ["label", "role", "x", "y", "keyInstructions", "suggestedPlayer"],
        additionalProperties: false,
      },
    },
    inPossession: { type: "array", items: { type: "string" } },
    outOfPossession: { type: "array", items: { type: "string" } },
    transitions: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    vulnerabilities: { type: "array", items: { type: "string" } },
    trainingPriorities: {
      type: "array",
      items: { type: "string" },
      description: "What to train to make this formation work with this squad",
    },
  },
  required: [
    "recommendedFormation",
    "formationRationale",
    "positions",
    "inPossession",
    "outOfPossession",
    "transitions",
    "strengths",
    "vulnerabilities",
    "trainingPriorities",
  ],
  additionalProperties: false,
} as const;

export const GAME_PLAN_SCHEMA = {
  type: "object",
  properties: {
    matchTitle: { type: "string", description: "e.g. 'vs Rapids FC — League, Saturday'" },
    keysToTheGame: { type: "array", items: { type: "string" }, description: "3-5 things that decide this game" },
    inPossession: { type: "array", items: { type: "string" } },
    outOfPossession: { type: "array", items: { type: "string" } },
    setPieces: { type: "array", items: { type: "string" }, description: "Attacking and defending restart plans" },
    matchups: {
      type: "array",
      description: "Key individual or zonal matchups to exploit or protect",
      items: {
        type: "object",
        properties: {
          zone: { type: "string" },
          plan: { type: "string" },
          exploit: { type: "boolean", description: "true = attack this matchup, false = protect it" },
        },
        required: ["zone", "plan", "exploit"],
        additionalProperties: false,
      },
    },
    firstTenMinutes: { type: "array", items: { type: "string" }, description: "The opening script" },
    pregameTalk: { type: "string", description: "A short, age-appropriate pregame speech, word for word" },
    benchNotes: { type: "array", items: { type: "string" }, description: "Substitution and game-management plan" },
    ifChasing: { type: "array", items: { type: "string" }, description: "Adjustments if losing" },
    ifProtecting: { type: "array", items: { type: "string" }, description: "Adjustments if winning" },
  },
  required: [
    "matchTitle", "keysToTheGame", "inPossession", "outOfPossession", "setPieces",
    "matchups", "firstTenMinutes", "pregameTalk", "benchNotes", "ifChasing", "ifProtecting",
  ],
  additionalProperties: false,
} as const;

export const SEASON_PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    ageGroup: { type: "string" },
    weeks: {
      type: "array",
      description: "One entry per training week, in order",
      items: {
        type: "object",
        properties: {
          week: { type: "integer" },
          block: { type: "string", description: "The periodization block this week belongs to, e.g. 'Foundation', 'In possession', 'Competition prep'" },
          theme: { type: "string" },
          objectives: { type: "array", items: { type: "string" } },
          sessionIdeas: { type: "array", items: { type: "string" }, description: "1-2 concrete session concepts for this week" },
          gameFocus: { type: "string", description: "What to watch for / emphasize in the weekend game" },
        },
        required: ["week", "block", "theme", "objectives", "sessionIdeas", "gameFocus"],
        additionalProperties: false,
      },
    },
    principles: { type: "array", items: { type: "string" }, description: "Season-long development principles" },
    checkpoints: { type: "array", items: { type: "string" }, description: "How to know it's working at weeks ~4, ~8, ~12" },
  },
  required: ["title", "ageGroup", "weeks", "principles", "checkpoints"],
  additionalProperties: false,
} as const;

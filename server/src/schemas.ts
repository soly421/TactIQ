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
        },
        required: ["label", "role", "x", "y", "keyInstructions"],
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

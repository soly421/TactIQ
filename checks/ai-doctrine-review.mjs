// AI doctrine review: a one-time expert audit of TactIQ's authored tactical
// content by the flagship model acting as a panel of licensed coaches.
// Breaks the author-validates-own-work circularity: the scenario pictures,
// matchup callout language, and all 16 advisor doctrines get reviewed by
// something other than the person who wrote them.
//
// Usage (needs the live key — run this the day it lands on the server):
//   ANTHROPIC_API_KEY=sk-... node checks/ai-doctrine-review.mjs
//   node checks/ai-doctrine-review.mjs --dry     # compile prompts only, no calls
//
// Output: checks/doctrine-review-report.md — findings ranked by severity,
// with concrete coordinate/text corrections to apply back to the source.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRY = process.argv.includes("--dry");

// bundle the formation engine fresh so the review always sees current data
execSync(`npx esbuild ${join(ROOT, "client/src/formations.ts")} --bundle --format=esm --outfile=${join(HERE, "formations.bundle.mjs")}`, { stdio: "pipe" });
const { FORMATIONS, SCENARIOS, applyScenario, matchupCallouts } = await import(join(HERE, "formations.bundle.mjs"));

const REVIEWER_SYSTEM = `You are a panel of three licensed soccer coaches reviewing content for a youth-coaching product: a UEFA A licence holder who has coached professional academies, a US Soccer A-licence director of coaching who lives inside the U9-HS age groups and small-sided standards, and a current professional analyst who works with positional data daily.

You are reviewing AUTHORED TACTICAL CONTENT for correctness against mainstream, textbook coaching doctrine (pressure-cover-balance, zonal shifting, +1 build-up, touchline traps, rest defense, cutback denial). You are not asked to be creative — you are asked to catch errors.

Rules of the review:
- Judge against consensus doctrine, not one school's taste. Flag only genuine errors or misleading content, not stylistic preferences.
- Coordinates are a 100x100 grid, y=0 is the OPPONENT goal (attacking up), own GK ~92, x=0 left touchline.
- Be concrete: every finding names the exact formation/scenario/advisor, quotes or cites the offending detail, and gives the specific correction (coordinates or replacement text).
- Rank findings: CRITICAL (teaches something wrong), MODERATE (imprecise enough to mislead), MINOR (polish).
- If a section is sound, say "SOUND" for it explicitly — silence is not a verdict.
Output plain markdown with a ## section per area reviewed and a findings list (or SOUND) under each.`;

function scenarioDoc(scenarioId) {
  const s = SCENARIOS.find((x) => x.id === scenarioId);
  const shapes = FORMATIONS.map((f) => {
    const ps = applyScenario(f, scenarioId);
    return `${f.format} ${f.name}: ${ps.map((p) => `${p.label}(${Math.round(p.x)},${Math.round(p.y)})`).join(" ")}`;
  }).join("\n");
  return `SCENARIO: ${s.name}\nCoaching points shown to users:\n${s.points.map((p) => `- ${p}`).join("\n")}\n\nAll 20 formation pictures in this scenario:\n${shapes}`;
}

function calloutsDoc() {
  // representative matchups across formats and scenario families
  const cases = [
    ["11v11", "4-3-3", "highpress", "4-4-2 Flat", "base"],
    ["11v11", "4-4-2 Flat", "midblock", "4-3-3", "base"],
    ["11v11", "3-5-2", "lowblock", "4-2-3-1", "base"],
    ["9v9", "3-2-3", "buildup", "4-3-1", "highpress"],
    ["9v9", "4-3-1", "wideAttack", "3-2-3", "lowblock"],
    ["7v7", "2-3-1", "defTransition", "3-1-2", "base"],
    ["7v7", "3-1-2", "defCross", "2-3-1", "base"],
    ["7v7", "2-3-1", "attTransition", "2-2-2", "midblock"],
  ];
  const mirror = (f, posture) => applyScenario(f, posture).map((p, i) => ({
    id: `opp-${i + 1}`, role: "OPP", label: p.label, x: Math.round(100 - p.x), y: Math.round(100 - p.y),
  }));
  return cases.map(([fmt, ourName, scenario, theirName, posture]) => {
    const ours = FORMATIONS.find((f) => f.format === fmt && f.name === ourName);
    const theirs = FORMATIONS.find((f) => f.format === fmt && f.name === theirName);
    const m = matchupCallouts(applyScenario(ours, scenario), mirror(theirs, posture), scenario);
    return `MATCHUP: our ${fmt} ${ourName} in ${scenario} vs their ${theirName} (${posture})\nCallouts shown on the field:\n${m.callouts.map((c) => `${c.n}. [${c.kind}] ${c.text}`).join("\n")}\nRecommended ball route: ${m.ballPath.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(" -> ")}`;
  }).join("\n\n");
}

const jobs = [
  ...SCENARIOS.filter((s) => s.id !== "base").map((s) => ({
    name: `scenario-${s.id}`,
    prompt: `Review this scenario's coaching points and ALL 20 formation pictures for doctrinal errors — wrong line heights, players out of position for the scenario's purpose, pictures that contradict the coaching points, spacing no coach would draw.\n\n${scenarioDoc(s.id)}`,
  })),
  {
    name: "matchup-callouts",
    prompt: `Review these on-field coaching instructions (generated by a deterministic matchup engine) for doctrinal errors: wrong player assigned to a job, instructions no licensed coach would give, misleading language, ball routes that make no tactical sense.\n\n${calloutsDoc()}`,
  },
  {
    name: "advisor-doctrines",
    prompt: `Below is the source file defining 16 AI coaching advisor personas, each with a detailed doctrine (game model, player selection, subs, training method, culture). Review every doctrine for: (a) tactical claims that are factually wrong, (b) advice inappropriate for youth players that isn't flagged as adult-level, (c) doctrines that blur together instead of representing genuinely distinct schools, (d) misattributed ideas (a philosophy described as one school's that actually belongs to another).\n\n${readFileSync(join(ROOT, "server/src/personas.ts"), "utf8")}`,
  },
];

if (DRY) {
  for (const j of jobs) console.log(`${j.name}: ~${Math.round(j.prompt.length / 4).toLocaleString()} tokens`);
  console.log(`\n${jobs.length} review calls compiled. Run without --dry once ANTHROPIC_API_KEY is set.`);
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. This review needs the live key — run it the day the key lands on the server (or export it locally). Use --dry to preview the prompts.");
  process.exit(1);
}

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const client = new Anthropic();
const sections = [];

for (const job of jobs) {
  process.stdout.write(`reviewing ${job.name}… `);
  const stream = client.beta.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: REVIEWER_SYSTEM,
    messages: [{ role: "user", content: job.prompt }],
  });
  const final = await stream.finalMessage();
  const text = final.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  sections.push(`# ${job.name}\n\n${text}`);
  console.log(`done (${final.usage?.output_tokens ?? "?"} out tokens)`);
}

const report = `# TactIQ doctrine review — ${new Date().toISOString().slice(0, 10)}\n\nReviewed by claude-opus-4-8 acting as a licensed-coach panel. Apply CRITICAL and MODERATE corrections back to client/src/formations.ts / server/src/personas.ts, then re-run npm run check:formations.\n\n${sections.join("\n\n---\n\n")}\n`;
writeFileSync(join(HERE, "doctrine-review-report.md"), report);
console.log(`\nreport written: checks/doctrine-review-report.md (${report.length.toLocaleString()} chars)`);

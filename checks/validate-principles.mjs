// Validates every formation × scenario against standard coaching principles.
// Bundled from client/src/formations.ts via esbuild.
import { FORMATIONS, SCENARIOS, applyScenario } from "./formations.bundle.mjs";

let fails = 0;
const fail = (f, s, msg) => { fails++; console.log(`FAIL ${f.format} ${f.name} / ${s}: ${msg}`); };

const outfield = (ps) => ps.filter((p) => p.role !== "GK");
const meanX = (ps) => ps.reduce((a, p) => a + p.x, 0) / ps.length;

for (const f of FORMATIONS) {
  for (const s of SCENARIOS.map((x) => x.id)) {
    const ps = applyScenario(f, s);
    const of = outfield(ps);
    const gk = ps.find((p) => p.role === "GK");

    // universal: nobody stacked (post-collision-resolution)
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) < 4.5)
          fail(f, s, `${ps[i].label}+${ps[j].label} stacked at (${ps[i].x.toFixed(0)},${ps[i].y.toFixed(0)})`);

    if (s === "highpress") {
      const ball = { x: 14, y: 26 };
      // 1. someone presses the ball at the touchline
      const near = of.filter((p) => Math.hypot(p.x - ball.x, p.y - ball.y) < 10);
      if (near.length < 1) fail(f, s, "no presser within 10 of the touchline trap");
      // 2. the presser is genuinely AT the touchline
      if (!of.some((p) => p.x <= 18 && Math.abs(p.y - ball.y) < 12)) fail(f, s, "nobody at the touchline near the ball");
      // 3. block shifted ball-side: mean x well left of center
      if (meanX(of) > 44) fail(f, s, `block not shifted to ball side (meanX=${meanX(of).toFixed(1)})`);
      // 4. weak-side tuck: no outfielder hugging the far touchline
      const wide = of.filter((p) => p.x > 72);
      if (wide.length > 0) fail(f, s, `weak side not tucked: ${wide.map((p) => `${p.label}@${p.x.toFixed(0)}`).join(",")}`);
      // 5. back line holds around halfway (not camped deep)
      const backs = ps.filter((p) => ["CB", "FB"].includes(p.role));
      if (backs.some((b) => b.y > 58)) fail(f, s, "back line dropped off during the press");
      // 6. keeper sweeps
      if (gk && gk.y > 75) fail(f, s, `keeper not sweeping (y=${gk.y})`);
      // 7. ball-side lanes locked: at least 3 players within 20 of the ball
      if (of.filter((p) => Math.hypot(p.x - ball.x, p.y - ball.y) < 20).length < 3)
        fail(f, s, "trap not supported — fewer than 3 players around the ball");
    }

    if (s === "midblock") {
      const ball = { x: 76, y: 28 };
      // 1. vertical compactness 30-35yd (~ <= 38 units incl engager step)
      const ys = of.map((p) => p.y);
      if (Math.max(...ys) - Math.min(...ys) > 45) fail(f, s, `block too stretched vertically (${(Math.max(...ys) - Math.min(...ys)).toFixed(0)})`);
      // 2. shifted toward the ball side
      if (meanX(of) < 54) fail(f, s, `block not shifted ball-side (meanX=${meanX(of).toFixed(1)})`);
      // 3. weak-side tuck
      if (of.some((p) => p.x < 26)) fail(f, s, "weak-side player holding width in the block");
      // 4. someone showing the carrier down the line
      if (!of.some((p) => Math.hypot(p.x - ball.x, p.y - ball.y) < 12)) fail(f, s, "nobody engaging the wide carrier");
    }

    if (s === "lowblock") {
      const ball = { x: 84, y: 68 };
      // 1. everyone but the outlet behind y>=58
      const high = of.filter((p) => p.y < 55);
      if (high.length > 1) fail(f, s, `${high.length} players ahead of the block (only the outlet may stay)`);
      if (high.length === 0) fail(f, s, "no counter outlet left alive");
      // 2. near defender engaging the ball
      if (!of.some((p) => Math.hypot(p.x - ball.x, p.y - ball.y) < 8)) fail(f, s, "nobody engaging the crosser");
      // 3. shifted ball-side
      const blockers = of.filter((p) => p.y >= 55);
      if (meanX(blockers) < 50) fail(f, s, `block not slid to ball side (meanX=${meanX(blockers).toFixed(1)})`);
      // 4. goal-side coverage: >=2 players deep in front of goal center
      // (role-agnostic — in a 1-4-1 the mids ARE the cover)
      if (of.filter((p) => p.y >= 72 && p.x > 30 && p.x < 78).length < 2)
        fail(f, s, "central box cover missing");
    }

    if (s === "defCross") {
      // >=2 zonal defenders across the box
      if (of.filter((p) => p.y >= 84 && p.x >= 30 && p.x <= 70).length < 2) fail(f, s, "fewer than 2 zonal defenders in the box");
      // presser on the crosser (ball at 16,76)
      if (!of.some((p) => Math.hypot(p.x - 16, p.y - 76) < 10)) fail(f, s, "nobody pressing the crosser");
      // cutback zone owned
      if (!of.some((p) => p.y > 68 && p.y < 80 && p.x > 38 && p.x < 60)) fail(f, s, "cutback zone unowned");
    }

    if (s === "defTransition") {
      const ball = { x: 50, y: 42 };
      const hunters = of.filter((p) => Math.hypot(p.x - ball.x, p.y - ball.y) < 13);
      if (hunters.length < 2) fail(f, s, "fewer than 2 counter-pressers at the loss point");
      if (hunters.length > 4) fail(f, s, "too many piling into the counter-press");
    }

    if (s === "buildup") {
      // GK is the +1 and deep
      if (gk && gk.y < 82) fail(f, s, "keeper not available as the +1");
      // back line split wide
      const cbs = ps.filter((p) => p.role === "CB");
      if (cbs.length >= 2) {
        const xs = cbs.map((c) => c.x);
        if (Math.max(...xs) - Math.min(...xs) < 30) fail(f, s, "CBs not split for build-up");
      }
      // someone between the lines (y 30-55) to receive
      if (!of.some((p) => p.y > 30 && p.y < 58 && Math.abs(p.x - 50) < 25)) fail(f, s, "no central option between the lines");
    }

    if (s === "attTransition") {
      // rest defense: >=2 non-GK players behind halfway
      if (of.filter((p) => p.y >= 50).length < 2) fail(f, s, "no rest defense behind the counter");
      // runners actually broke: someone high
      if (!of.some((p) => p.y <= 14)) fail(f, s, "no runner in behind");
    }

    if (s === "wideAttack") {
      // overload on the right: >=3 outfielders x>=60
      if (of.filter((p) => p.x >= 60).length < 3) fail(f, s, "no wide overload");
      // 4 distinct box arrivals: players at y<=30 spread over >=3 x-bands
      const arrivals = of.filter((p) => p.y <= 30);
      if (arrivals.length < 3) fail(f, s, "fewer than 3 box arrivals");
      // weak-side balance: someone home (y>=50)
      if (!of.some((p) => p.y >= 50)) fail(f, s, "nobody balancing behind the wide attack");
    }
  }
}

console.log(fails === 0 ? `ALL PASS — ${FORMATIONS.length} formations × ${SCENARIOS.length} scenarios validated against coaching principles` : `${fails} failures`);
process.exit(fails === 0 ? 0 : 1);

// Doctrine validation of the matchup engine: every formation x scenario x
// same-format opponent x posture must obey the coaching rules, not just
// produce output. Counts are recomputed independently and cross-checked.
import { FORMATIONS, SCENARIOS, applyScenario, matchupCallouts } from "./formations.bundle.mjs";

const mirror = (f, posture) => applyScenario(f, posture).map((p, i) => ({
  id: `opp-${i+1}`, role: "OPP", label: p.label, x: Math.round(100 - p.x), y: Math.round(100 - p.y),
}));

const FRONT_MID = new Set(["ST", "W", "AM", "CM", "DM"]);
let fails = 0, cases = 0;
const fail = (ctx, msg) => { fails++; if (fails <= 14) console.log(`FAIL ${ctx}: ${msg}`); };

const fromPiece = (ours, c) => (c.from ? ours.find((p) => Math.abs(p.x - c.from.x) < 0.01 && Math.abs(p.y - c.from.y) < 0.01) : undefined);

for (const f of FORMATIONS) {
  for (const s of SCENARIOS.map((x) => x.id)) {
    if (s === "base") continue;
    for (const of_ of FORMATIONS.filter((o) => o.format === f.format)) {
      for (const posture of ["base", "highpress", "midblock", "lowblock"]) {
        cases++;
        const ctx = `${f.format} ${f.name}/${s} vs ${of_.name}(${posture})`;
        const ours = applyScenario(f, s);
        const opps = mirror(of_, posture);
        const m = matchupCallouts(ours, opps, s);

        if (m.callouts.length < 1 || m.callouts.length > 5) fail(ctx, `${m.callouts.length} callouts`);
        for (const c of m.callouts) {
          if (c.x < 0 || c.x > 100 || c.y < 0 || c.y > 100) fail(ctx, `callout ${c.n} out of bounds`);
          if (!c.text || c.text.length < 25) fail(ctx, `callout ${c.n} text too thin`);
          if (/undefined|NaN|\[object/.test(c.text)) fail(ctx, `bad text: ${c.text.slice(0, 60)}`);
          const fp = fromPiece(ours, c);
          if (c.from && fp && Math.hypot(fp.x - c.x, fp.y - c.y) > 50) fail(ctx, `callout ${c.n} assignment travel > 50`);
        }
        if (m.ballPath.length === 1) fail(ctx, "degenerate ball path");
        for (const p of m.ballPath) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(ctx, "NaN in path");

        if (s === "highpress") {
          for (const c of m.callouts.filter((c) => c.kind === "press")) {
            const fp = fromPiece(ours, c);
            if (fp && !FRONT_MID.has(fp.role)) fail(ctx, `back-line player ${fp.label} (${fp.role}) assigned to press — never jumps`);
          }
          if (!m.callouts.some((c) => /presses their|jumps their|locks their/.test(c.text))) fail(ctx, "no press assignment in a high press");
        }
        if (s === "midblock") {
          if (m.callouts.some((c) => /presses their|jumps their/.test(c.text))) fail(ctx, "mid block chasing — it screens and shifts, it doesn't press");
          if (!m.callouts.some((c) => /screens|shift|arrives on his first touch/.test(c.text))) fail(ctx, "no screen/shift/trap doctrine in mid block");
          for (const c of m.callouts.filter((c) => c.kind === "press")) {
            const fp = fromPiece(ours, c);
            if (fp && !FRONT_MID.has(fp.role)) fail(ctx, `block defender ${fp.label} pulled out of the line`);
          }
        }
        if (s === "lowblock") {
          const engage = m.callouts.find((c) => /closes their/.test(c.text));
          if (engage) {
            const fp = fromPiece(ours, engage);
            if (fp && fp.y <= 48) fail(ctx, `engager ${fp.label} came from the front line, not the block`);
          }
          if (!m.callouts.some((c) => /cutback/.test(c.text)) && ours.some((p) => ["CM", "DM"].includes(p.role))) fail(ctx, "cutback zone unowned in low block");
          for (const c of m.callouts.filter((cc) => /owns their .* in the box/.test(cc.text))) {
            const fp = fromPiece(ours, c);
            if (fp && !["CB", "FB"].includes(fp.role)) fail(ctx, `box mark by ${fp.role} — that's the back line's job`);
          }
        }
        if (s === "defCross") {
          if (m.callouts.length < 2) fail(ctx, "cross defense needs presser + marks at minimum");
        }
        if (s === "buildup") {
          const num = m.callouts.find((c) => /Numbers: (\d+)v(\d+)/.test(c.text));
          if (num) {
            const [, a, b] = num.text.match(/Numbers: (\d+)v(\d+)/);
            const gk = ours.find((p) => p.role === "GK");
            const buildUnit = ours.filter((p) => ["CB", "FB"].includes(p.role) && p.y > 55).length + (gk ? 1 : 0);
            const advanced = opps.filter((o) => o.y > 50).length;
            if (Number(a) !== buildUnit) fail(ctx, `numbers says ${a} builders, actual ${buildUnit}`);
            if (Number(b) > advanced) fail(ctx, `numbers says ${b} pressers, only ${advanced} advanced`);
            const plus = Number(a) - Number(b);
            if (plus > 0 && !/\+\d/.test(num.text)) fail(ctx, "spare man exists but text doesn't say so");
            if (plus <= 0 && !/no spare man/.test(num.text)) fail(ctx, "even/short numbers but text claims advantage");
          }
        }
        if (s === "attTransition") {
          const cnt = m.callouts.find((c) => /(\d+)v(\d+) back there/.test(c.text));
          if (cnt) {
            const [, , b] = cnt.text.match(/(\d+)v(\d+) back there/);
            const sorted = [...opps].sort((x, y) => x.y - y.y);
            const groups = [];
            for (const o of sorted) { const g = groups[groups.length - 1]; if (g && o.y - g[g.length - 1].y <= 9) g.push(o); else groups.push([o]); }
            let back = groups[0] ?? [];
            if (groups.length > 1 && groups[0].length === 1 && groups[0][0].y < 20) back = groups[1] ?? [];
            const rest = back.filter((o) => o.y < 50).length;
            if (Number(b) !== rest) fail(ctx, `transition says ${b} rest defenders, actual ${rest}`);
          }
        }
        if (s === "wideAttack") {
          const cnt = m.callouts.find((c) => /(\d+)v(\d+) on the overload side/.test(c.text));
          if (cnt) {
            const [, a, b] = cnt.text.match(/(\d+)v(\d+) on the overload side/);
            const oursFlank = ours.filter((p) => p.role !== "GK" && p.x >= 60).length;
            const theirsFlank = opps.filter((o) => o.x >= 55 && o.y < 60).length;
            if (Number(a) !== oursFlank || Number(b) !== theirsFlank) fail(ctx, `overload ${a}v${b}, actual ${oursFlank}v${theirsFlank}`);
          }
        }
        if (s === "defTransition") {
          if (!m.callouts.some((c) => /hunt/.test(c.text))) fail(ctx, "no hunting instruction in counter-press");
          if (!m.callouts.some((c) => /escape|out-ball|cut/i.test(c.text))) fail(ctx, "escape lane not addressed");
        }
      }
    }
  }
}
console.log(`\n${cases} matchup cases checked against doctrine, ${fails} failures`);
process.exit(fails ? 1 : 0);

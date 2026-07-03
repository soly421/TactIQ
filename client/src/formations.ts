// ============================================================================
// The Formation Encyclopedia: every 7v7/9v9/11v11 system as role-tagged data,
// plus scenario transforms that reshape any formation into its build-up,
// pressing, block, transition, and crossing pictures. Authored data = instant,
// correct, free; the AI engine reads the *modified* board on top of this base.
// Coordinates: 100x100, y=0 is the OPPONENT goal (attacking up), own GK ~92.
// ============================================================================

export type Role = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "W" | "ST" | "OPP";

export interface Piece {
  id: string;
  role: Role;
  label: string; // shirt-style label: GK, RCB, LW…
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  format: "7v7" | "9v9" | "11v11";
  name: string;
  blurb: string;
  pieces: Piece[];
  // Formation-specific flavor appended to generic scenario coaching points.
  notes?: Partial<Record<ScenarioId, string>>;
}

// Build pieces from row specs (defense -> attack), auto-labeling by side.
function rows(spec: [Role, number, number[]][]): Piece[] {
  const out: Piece[] = [];
  const counts = new Map<Role, number>();
  for (const [role, y, xs] of spec) {
    xs.forEach((x, i) => {
      const n = (counts.get(role) ?? 0) + 1;
      counts.set(role, n);
      const side = xs.length === 1 ? "" : x < 40 ? "L" : x > 60 ? "R" : xs.length >= 3 ? "C" : "";
      out.push({ id: `${role}${n}`, role, label: role === "GK" ? "GK" : `${side}${role}`.slice(0, 3), x, y });
    });
  }
  return out;
}

export const FORMATIONS: Formation[] = [
  // ---------------- 7v7 (GK + 6) ----------------
  {
    id: "7-231", format: "7v7", name: "2-3-1",
    blurb: "The recommended developmental shape — balance everywhere, maps onto 4-3-3 later.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [35, 65]], ["CM", 52, [22, 50, 78]], ["ST", 28, [50]]]),
    notes: { buildup: "The wide CMs are your out-balls — CBs split, the middle CM shows between their strikers." },
  },
  {
    id: "7-321", format: "7v7", name: "3-2-1",
    blurb: "Back-three solidity; outside backs join the attack with the striker pinning.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [25, 50, 75]], ["CM", 50, [38, 62]], ["ST", 28, [50]]]),
    notes: { buildup: "Natural 3+2 build-up — the wide CBs must have the courage to step out with the ball." },
  },
  {
    id: "7-312", format: "7v7", name: "3-1-2",
    blurb: "Two strikers to press and combine; the lone pivot must be your most disciplined player.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [25, 50, 75]], ["DM", 54, [50]], ["ST", 30, [38, 62]]]),
    notes: { highpress: "The two strikers split their CBs; the pivot must NOT jump — they screen the middle alone." },
  },
  {
    id: "7-141", format: "7v7", name: "1-4-1",
    blurb: "Midfield swarm — wins the ball high, but the lone defender lives dangerously.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [50]], ["CM", 52, [15, 38, 62, 85]], ["ST", 28, [50]]]),
    notes: { defTransition: "The counter-press is NOT optional in this shape — one ball over the top beats your lone CB." },
  },
  {
    id: "7-213", format: "7v7", name: "2-1-3",
    blurb: "Full-width front three; thrilling going forward, brutal on the lone midfielder.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [35, 65]], ["CM", 52, [50]], ["W", 30, [18, 82]], ["ST", 26, [50]]]),
    notes: { midblock: "The wingers must drop level with the CM or the block is a 3-man wall with highways beside it." },
  },
  {
    id: "7-222", format: "7v7", name: "2-2-2",
    blurb: "Strong central spine, high press friendly — but no natural width.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [35, 65]], ["CM", 52, [35, 65]], ["ST", 28, [38, 62]]]),
    notes: { wideAttack: "Width must come from a CB or CM breaking wide — rehearse WHO goes, or nobody does." },
  },
  {
    id: "7-411", format: "7v7", name: "4-1-1",
    blurb: "Teaches the back four early; the striker and mid can get lonely.",
    pieces: rows([["GK", 92, [50]], ["CB", 74, [32, 68]], ["FB", 72, [12, 88]], ["CM", 50, [50]], ["ST", 28, [50]]]),
    notes: { buildup: "The fullbacks are your width AND your midfield support — they play like wingbacks in possession." },
  },

  // ---------------- 9v9 (GK + 8) ----------------
  {
    id: "9-231", format: "9v9", name: "3-2-3",
    blurb: "Triangles everywhere — the most possession-friendly 9v9 shape.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [25, 50, 75]], ["CM", 54, [38, 62]], ["W", 30, [15, 85]], ["ST", 26, [50]]]),
    notes: { defCross: "Wingers MUST recover to make a back five in the box — the back three can't defend both posts." },
  },
  {
    id: "9-431", format: "9v9", name: "4-3-1",
    blurb: "The best 11v11 preparation — real back four, real wing play.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [36, 64]], ["FB", 74, [12, 88]], ["CM", 52, [26, 50, 74]], ["ST", 26, [50]]]),
    notes: { attTransition: "The striker is alone — the nearest CM MUST break forward with every counter or nothing sticks." },
  },
  {
    id: "9-242", format: "9v9", name: "2-4-2",
    blurb: "Midfield overload, strike partnership — but space behind the wide mids.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [36, 64]], ["CM", 52, [12, 38, 62, 88]], ["ST", 28, [38, 62]]]),
    notes: { lowblock: "Your wide mids become fullbacks here — if they don't drop, the CBs defend 2v4." },
  },
  {
    id: "9-2321", format: "9v9", name: "2-3-2-1",
    blurb: "The chameleon — possession, transition, or direct; the stepping stone to 3-4-3.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [36, 64]], ["CM", 56, [18, 50, 82]], ["AM", 38, [38, 62]], ["ST", 24, [50]]]),
    notes: { midblock: "The two pocket forwards are your counter outlets — they stay HIGH in the block, that's the point." },
  },
  {
    id: "9-21311", format: "9v9", name: "2-1-3-1-1",
    blurb: "Compact and central; the destroyer 6 frees the creators. No natural width.",
    pieces: rows([["GK", 92, [50]], ["CB", 76, [36, 64]], ["DM", 62, [50]], ["CM", 48, [20, 50, 80]], ["AM", 34, [50]], ["ST", 22, [50]]]),
    notes: { wideAttack: "Width is a sprint, not a position — the wide CMs make it, and the 6 covers the vacated lane." },
  },

  // ---------------- 11v11 (GK + 10) ----------------
  {
    id: "11-433", format: "11v11", name: "4-3-3",
    blurb: "Triangles all over — the possession standard.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["DM", 60, [50]], ["CM", 50, [32, 68]], ["W", 28, [12, 88]], ["ST", 24, [50]]]),
    notes: { buildup: "The 6 is the metronome — if they're marked, a CM drops OR the fullbacks invert. Never both." },
  },
  {
    id: "11-4231", format: "11v11", name: "4-2-3-1",
    blurb: "The balance king — counter-attack perfection with a true 10.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["DM", 58, [40, 60]], ["W", 34, [14, 86]], ["AM", 38, [50]], ["ST", 22, [50]]]),
    notes: { attTransition: "Win it, find the 10 between the lines, wingers sprint — three passes, ten seconds, shot." },
  },
  {
    id: "11-442", format: "11v11", name: "4-4-2 Flat",
    blurb: "Two banks of four — eight players between the opponent and your goal.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["CM", 52, [38, 62]], ["W", 48, [12, 88]], ["ST", 26, [40, 60]]]),
    notes: { midblock: "The two banks shift TOGETHER — the classic picture. One striker screens, one presses the ball-side CB." },
  },
  {
    id: "11-442d", format: "11v11", name: "4-4-2 Diamond",
    blurb: "Midfield numbers, flexible pockets — width comes from fullbacks only.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["DM", 60, [50]], ["CM", 48, [30, 70]], ["AM", 36, [50]], ["ST", 24, [40, 60]]]),
    notes: { wideAttack: "The fullbacks ARE the wingers — if they can't get high, play something else today." },
  },
  {
    id: "11-4141", format: "11v11", name: "4-1-4-1",
    blurb: "The pivot anchors everything; a press-resistant mid-block machine.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["DM", 62, [50]], ["CM", 46, [32, 68]], ["W", 44, [12, 88]], ["ST", 24, [50]]]),
    notes: { highpress: "The line of four jumps together and the 6 sweeps behind them — never the other way round." },
  },
  {
    id: "11-4321", format: "11v11", name: "4-3-2-1",
    blurb: "The Christmas tree — central control, wingback license.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [38, 62]], ["FB", 74, [12, 88]], ["CM", 56, [30, 50, 70]], ["AM", 38, [38, 62]], ["ST", 24, [50]]]),
    notes: { defCross: "Your fullbacks defend the byline alone — the two 10s must own the cutback zone." },
  },
  {
    id: "11-352", format: "11v11", name: "3-5-2",
    blurb: "Back three with wingbacks — flips to 5-3-2 the moment you lose it.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [28, 50, 72]], ["FB", 58, [8, 92]], ["DM", 58, [50]], ["CM", 48, [34, 66]], ["ST", 26, [40, 60]]]),
    notes: { lowblock: "Wingbacks drop to make a five — the block is a 5-3 with two counter outlets staying high." },
  },
  {
    id: "11-343", format: "11v11", name: "3-4-3",
    blurb: "Wide overloads and a free-flowing front three; brutal on wingback legs.",
    pieces: rows([["GK", 92, [50]], ["CB", 78, [28, 50, 72]], ["FB", 56, [8, 92]], ["CM", 54, [38, 62]], ["W", 28, [18, 82]], ["ST", 24, [50]]]),
    notes: { defTransition: "One wingback attacks, the OTHER tucks in as a fourth defender — they can never both be high." },
  },
];

// ---------------------------------------------------------------------------
// Scenarios: role-aware transforms. Each returns new positions + coaching
// points; the board animates the difference and draws the movement arrows.
// ---------------------------------------------------------------------------

export type ScenarioId =
  | "base" | "buildup" | "highpress" | "midblock" | "lowblock"
  | "attTransition" | "defTransition" | "wideAttack" | "defCross";

export interface Scenario {
  id: ScenarioId;
  name: string;
  emoji: string;
  points: string[];
}

export const SCENARIOS: Scenario[] = [
  { id: "base", name: "Base Shape", emoji: "📐", points: ["The rest positions — every scenario starts and ends here.", "Spacing is the discipline: too close and one pass beats two of you; too far and there's no support."] },
  { id: "buildup", name: "Build-Up", emoji: "🧱", points: ["The keeper is a +1 — build 3v2 against their first line, not 2v2.", "Split the CBs to the width of the box; the pivot shows between or beside their strikers.", "Fullbacks/wide players push HIGH before the ball moves — their marker has to choose.", "The picture to find: a free player facing forward between their lines."] },
  { id: "highpress", name: "High Press", emoji: "🌪️", points: ["Press with the front line curved — show them ONE way, never both.", "The trigger: a bad touch, a back-pass, or a keeper forced onto their weak foot.", "Squeeze the whole team up — the back line holds the halfway line, keeper sweeps.", "If they break the first wave, everyone sprints home — no half-pressing."] },
  { id: "midblock", name: "Mid Block", emoji: "🧊", points: ["Compact 30-35 yards front-to-back; shift together as the ball moves.", "Protect the middle — force play around the block, never through it.", "The front players screen passing lanes into their pivot.", "The block is a trap, not a rest: win it here and you're 40 yards from goal."] },
  { id: "lowblock", name: "Low Block", emoji: "🏰", points: ["Defend the width of the box, not the width of the pitch.", "Every player behind the ball, one outlet stays for the counter.", "Deny the cutback zone — it's the highest-value pass in youth soccer.", "Clear with purpose: to the corner or to the outlet, never through the middle."] },
  { id: "attTransition", name: "Attacking Transition", emoji: "🚀", points: ["First pass FORWARD if it's on — the picture lasts 3 seconds.", "Nearest runners break in behind, one support player arrives late.", "Rest defense holds: 2+1 stay behind the ball, always.", "Finish the attack within 10 seconds or keep the ball and reset."] },
  { id: "defTransition", name: "Counter-Press", emoji: "⛈️", points: ["The 5-second rule: the nearest 2-3 players HUNT the instant it's lost.", "Cut the exit passes with curved runs — trap the ball, not the player.", "Everyone else drops and narrows while the press happens.", "Win it back high and the goal is 3 passes away."] },
  { id: "wideAttack", name: "Wide Attack & Box Arrivals", emoji: "🎯", points: ["Overload one side to isolate the far winger 1v1.", "Box arrivals: near post, far post, cutback, top of the box — four runs, every cross.", "The cutback beats the floated cross at every youth age.", "Weak-side player stays wide until the last second — then attacks the far post."] },
  { id: "defCross", name: "Defending the Cross", emoji: "🥊", points: ["Back line drops into the box and marks ZONES across the goal.", "Nearest defender presses the crosser — take away the driven ball.", "One midfielder owns the cutback zone at the top of the box.", "First contact wins: attack the ball, clear high and wide, then step out together."] },
];

const clamp = (v: number, lo = 4, hi = 96) => Math.min(hi, Math.max(lo, v));

// Rescale a piece's width around the pitch center — preserves left/right
// order and relative spacing within a line, so lines compress or stretch
// without ever collapsing into each other.
const scaleX = (p: Piece, f: number, lo = 6, hi = 94) => { p.x = clamp(50 + (p.x - 50) * f, lo, hi); };

// No two pieces may occupy the same spot: nudge overlapping pairs apart.
// A safety net so every one of the 20 formations stays readable in every
// scenario, whatever the role mix.
export function resolveCollisions(ps: Piece[]): Piece[] {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[j].x - ps[i].x, dy = ps[j].y - ps[i].y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          const ux = d < 0.01 ? 1 : dx / d, uy = d < 0.01 ? 0 : dy / d;
          const push = (6 - d) / 2 + 0.3;
          ps[i].x = clamp(ps[i].x - ux * push); ps[i].y = clamp(ps[i].y - uy * push);
          ps[j].x = clamp(ps[j].x + ux * push); ps[j].y = clamp(ps[j].y + uy * push);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return ps;
}

// Apply a scenario to a formation's base pieces. Line-based and tactically
// grounded: each row keeps its structure while line heights and widths move
// to the standard coaching picture for that moment of the game.
export function applyScenario(f: Formation, s: ScenarioId): Piece[] {
  const ps = f.pieces.map((p) => ({ ...p }));
  const by = (r: Role) => ps.filter((p) => p.role === r);
  const wingers = by("W");
  const sts = by("ST");
  const cms = by("CM").sort((a, b) => a.x - b.x);

  switch (s) {
    case "base":
      return ps;

    case "buildup": {
      // The +1 build: GK stays as the spare, back line splits to the width of
      // the box, the pivot shows between their strikers, wide players push
      // high before the ball moves, striker pins the last line.
      const backs = by("CB");
      for (const p of ps) {
        if (p.role === "GK") p.y = 88;
        else if (p.role === "CB") { p.y = 76; scaleX(p, backs.length >= 3 ? 1.3 : 1.6, 16, 84); }
        else if (p.role === "FB") { p.y = 48; scaleX(p, 1.15, 6, 94); }
        else if (p.role === "DM") { p.y = 62; scaleX(p, 0.9); }
        else if (p.role === "AM") p.y = 38;
        else if (p.role === "W") { p.y = 25; scaleX(p, 1.12, 8, 92); }
        else if (p.role === "ST") p.y = 16;
      }
      // Midfield staggers: wide CMs become the out-balls, the central CM
      // drops toward the ball as the pivot.
      cms.forEach((c) => {
        const live = ps.find((p) => p.id === c.id)!;
        const central = Math.abs(c.x - 50) < 12;
        if (central) live.y = by("DM").length ? 50 : 58;
        else { live.y = 46; scaleX(live, 1.3, 8, 92); }
      });
      return resolveCollisions(ps);
    }

    case "highpress": {
      // Squeeze the whole team up: back line holds halfway, keeper sweeps
      // behind it, front curves onto their build-up.
      for (const p of ps) {
        if (p.role === "GK") p.y = 70;
        else if (p.role === "CB") { p.y = 50; scaleX(p, 0.9); }
        else if (p.role === "FB") { p.y = 46; scaleX(p, 0.95); }
        else if (p.role === "DM") p.y = 38;
        else if (p.role === "CM") { p.y = 32; scaleX(p, 0.85); }
        else if (p.role === "AM") p.y = 20;
        else if (p.role === "W") { p.y = 15; scaleX(p, 0.9); }
        else if (p.role === "ST") p.y = 9;
      }
      return resolveCollisions(ps);
    }

    case "midblock": {
      // 30 yards front-to-back, protect the middle, force play around.
      for (const p of ps) {
        if (p.role === "GK") p.y = 90;
        else if (p.role === "CB") { p.y = 70; scaleX(p, 0.85); }
        else if (p.role === "FB") { p.y = 68; scaleX(p, 0.88); }
        else if (p.role === "DM") { p.y = 58; scaleX(p, 0.8); }
        else if (p.role === "CM") { p.y = 53; scaleX(p, 0.75); }
        else if (p.role === "W") { p.y = 47; scaleX(p, 0.72); }
        else if (p.role === "AM") { p.y = 45; scaleX(p, 0.6); }
        else if (p.role === "ST") { p.y = 40; scaleX(p, 0.5); }
      }
      return resolveCollisions(ps);
    }

    case "lowblock": {
      // Defend the width of the box; one outlet stays alive for the counter.
      for (const p of ps) {
        if (p.role === "GK") p.y = 94;
        else if (p.role === "CB") { p.y = 84; scaleX(p, 0.72); }
        else if (p.role === "FB") { p.y = 82; scaleX(p, 0.8); }
        else if (p.role === "DM") { p.y = 76; scaleX(p, 0.7); }
        else if (p.role === "CM") { p.y = 73; scaleX(p, 0.68); }
        else if (p.role === "W") { p.y = 69; scaleX(p, 0.7); }
        else if (p.role === "AM") { p.y = 67; scaleX(p, 0.6); }
        else if (p.role === "ST") { p.y = 62; scaleX(p, 0.5); }
      }
      const outlet = sts[0] ?? wingers[0];
      if (outlet) { const live = ps.find((p) => p.id === outlet.id)!; live.x = 50; live.y = 46; }
      return resolveCollisions(ps);
    }

    case "attTransition": {
      // First 3 seconds after winning it: runners break, wide players STAY
      // wide, rest-defense (CBs + pivot) holds its line.
      for (const p of ps) {
        if (p.role === "ST") p.y = clamp(p.y - 18, 6);
        else if (p.role === "W") { p.y = clamp(p.y - 16, 8); scaleX(p, 1.08, 8, 92); }
        else if (p.role === "AM") p.y = clamp(p.y - 12, 12);
        else if (p.role === "CM") p.y = clamp(p.y - 8, 24);
        else if (p.role === "FB") { p.y = clamp(p.y - 6, 30); scaleX(p, 1.05, 6, 94); }
        else if (p.role === "CB") p.y = Math.min(p.y, 64);
        else if (p.role === "GK") p.y = 88;
      }
      return resolveCollisions(ps);
    }

    case "defTransition": {
      // The 5-second rule: ONLY the nearest 2-3 hunt the loss point — they
      // surround the ball, they don't pile onto one spot. Everyone else drops
      // and narrows, keeping their line.
      const ball = { x: 50, y: 42 };
      const hunters = ps
        .filter((p) => ["ST", "W", "AM", "CM"].includes(p.role))
        .sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y))
        .slice(0, 3);
      const ring: [number, number][] = [[0, -8], [-9, 5], [9, 5]];
      const free = [...ring];
      for (const h of hunters) {
        const live = ps.find((p) => p.id === h.id)!;
        let best = 0, bd = Infinity;
        free.forEach((r, i) => {
          const d = Math.hypot(ball.x + r[0] - h.x, ball.y + r[1] - h.y);
          if (d < bd) { bd = d; best = i; }
        });
        const r = free.splice(best, 1)[0];
        live.x = clamp(ball.x + r[0]);
        live.y = clamp(ball.y + r[1]);
      }
      for (const p of ps) {
        if (hunters.some((h) => h.id === p.id)) continue;
        if (p.role === "GK") p.y = 92;
        else if (p.role === "CB" || p.role === "FB") { p.y = clamp(p.y + 4, 10, 88); scaleX(p, 0.85); }
        else if (p.role === "DM") { p.x = clamp(50 + (p.x - 50) * 0.6); p.y = 56; }
        else { p.y = clamp(p.y + 8, 10, 88); scaleX(p, 0.8); }
      }
      return resolveCollisions(ps);
    }

    case "wideAttack": {
      // Overload the right, four distinct box arrivals: near post, far post,
      // cutback, top of the box. Every piece gets its OWN slot.
      for (const p of ps) {
        if (p.role === "GK") p.y = 90;
        else if (p.role === "CB") { p.y = 60; scaleX(p, 0.8); p.x = clamp(p.x + 5); }
        else if (p.role === "AM") { p.x = 52; p.y = 24; }
        else if (p.role === "W") {
          if (p.x > 50) { p.x = 87; p.y = 16; }           // the overloaded winger
          else { p.x = 38; p.y = 12; }                     // far-post arrival
        } else if (p.role === "FB") {
          if (p.x > 50) { p.x = 92; p.y = 26; }            // overlap
          else { p.x = 30; p.y = 52; }                     // tucks in for balance
        } else if (p.role === "ST") {
          p.y = 10; p.x = sts.length > 1 ? (p.x < 50 ? 46 : 60) : 58; // near post
        }
      }
      // Pivots stagger: near-side pivot supports the overload, the other
      // balances — never the same spot.
      const dms = by("DM").sort((a, b) => a.x - b.x);
      dms.forEach((d, i) => {
        const live = ps.find((p) => p.id === d.id)!;
        const slots: [number, number][] = dms.length >= 2 ? [[42, 50], [60, 44]] : [[54, 48]];
        const slot = slots[Math.min(i, slots.length - 1)];
        live.x = slot[0]; live.y = slot[1];
      });
      // Midfield arrivals: right-most CM attacks the top of the box, the
      // others hold staggered recycling angles — never the same spot.
      cms.forEach((c, i) => {
        const live = ps.find((p) => p.id === c.id)!;
        const slots: [number, number][] = cms.length >= 3 ? [[32, 44], [48, 40], [66, 32]] : [[40, 42], [66, 32]];
        const slot = slots[Math.min(i, slots.length - 1)];
        live.x = slot[0]; live.y = slot[1];
      });
      return resolveCollisions(ps);
    }

    case "defCross": {
      // Ball on our left flank. The back line NEVER drops below two zonal
      // defenders in the box; the presser comes from the line with cover.
      const backs = [...by("CB"), ...by("FB")].sort((a, b) => a.x - b.x);
      const mids = [...by("DM"), ...cms].sort((a, b) => a.x - b.x);
      let presser: Piece | undefined;
      let zonal = backs;
      if (backs.length >= 4) {
        presser = backs[0];                                  // near fullback presses
        zonal = backs.slice(1);
      } else {
        presser = mids[0];                                   // near mid presses, backs stay home
      }
      const zones = zonal.length >= 4 ? [34, 45, 56, 67] : zonal.length === 3 ? [38, 50, 62] : [40, 58];
      zonal.forEach((b, i) => {
        const live = ps.find((p) => p.id === b.id)!;
        live.x = zones[Math.min(i, zones.length - 1)]; live.y = 87;
      });
      if (presser) { const live = ps.find((p) => p.id === presser.id)!; live.x = 16; live.y = 76; }
      let remainingMids = mids.filter((m) => m.id !== presser?.id);
      // A one-CB shape (7v7 1-4-1): the deepest free mid drops in as the
      // second zonal defender — the box is never defended by one player.
      if (zonal.length < 2 && remainingMids.length) {
        const helper = remainingMids[remainingMids.length - 1];
        const live = ps.find((p) => p.id === helper.id)!;
        live.x = zones.length > 1 ? 58 : 56; live.y = 87;
        remainingMids = remainingMids.filter((m) => m.id !== helper.id);
      }
      const midSlots: [number, number][] = [[48, 74], [64, 69], [30, 68], [72, 64]];
      remainingMids.forEach((m, i) => {
        const live = ps.find((p) => p.id === m.id)!;
        const slot = midSlots[Math.min(i, midSlots.length - 1)];
        live.x = slot[0]; live.y = slot[1];                  // first owns the cutback zone
      });
      for (const p of ps) {
        if (p.role === "AM" || p.role === "W") { p.y = 62; scaleX(p, 0.5); }
        else if (p.role === "ST") { p.x = 50; p.y = 48; }    // the outlet
        else if (p.role === "GK") p.y = 94;
      }
      return resolveCollisions(ps);
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario choreography: the ball's story through each picture, plus the
// order the lines move in. The explorer plays these as a live sequence —
// waypoints resolve against the ACTUAL scenario positions of this formation,
// so every one of the 20 shapes animates its own version of the movement.
// ---------------------------------------------------------------------------

export type WaveOrder = Role[][];

export interface Choreo {
  // each waypoint: role to anchor to (picked by preference order) or raw point
  ball: ({ role: Role; pick: "left" | "right" | "center" | "high" } | { x: number; y: number })[];
  waves: WaveOrder; // which lines move first, second, third
}

export const CHOREO: Partial<Record<ScenarioId, Choreo>> = {
  buildup: {
    ball: [{ role: "GK", pick: "center" }, { role: "CB", pick: "left" }, { role: "DM", pick: "center" }, { role: "CM", pick: "left" }, { role: "W", pick: "left" }, { role: "ST", pick: "center" }],
    waves: [["GK", "CB", "FB"], ["DM", "CM"], ["AM", "W", "ST"]],
  },
  highpress: {
    ball: [{ x: 50, y: 12 }, { x: 28, y: 16 }, { x: 16, y: 24 }],
    waves: [["ST", "W", "AM"], ["CM", "DM"], ["CB", "FB", "GK"]],
  },
  midblock: {
    ball: [{ x: 50, y: 22 }, { x: 24, y: 28 }, { x: 76, y: 28 }, { x: 50, y: 20 }],
    waves: [["ST", "W", "AM"], ["CM", "DM"], ["CB", "FB", "GK"]],
  },
  lowblock: {
    ball: [{ x: 72, y: 56 }, { x: 86, y: 70 }, { x: 55, y: 84 }, { role: "ST", pick: "center" }],
    waves: [["ST", "W", "AM"], ["CM", "DM"], ["CB", "FB", "GK"]],
  },
  attTransition: {
    ball: [{ x: 46, y: 56 }, { role: "CM", pick: "center" }, { role: "W", pick: "right" }, { role: "ST", pick: "center" }],
    waves: [["ST", "W"], ["AM", "CM"], ["FB", "DM", "CB", "GK"]],
  },
  defTransition: {
    ball: [{ x: 50, y: 42 }],
    waves: [["ST", "W", "AM"], ["CM", "DM"], ["CB", "FB", "GK"]],
  },
  wideAttack: {
    ball: [{ x: 50, y: 46 }, { role: "FB", pick: "right" }, { role: "W", pick: "right" }, { role: "AM", pick: "center" }, { x: 50, y: 6 }],
    waves: [["CB", "FB", "GK"], ["DM", "CM"], ["AM", "W", "ST"]],
  },
  defCross: {
    ball: [{ x: 12, y: 66 }, { x: 16, y: 76 }, { x: 44, y: 86 }, { x: 62, y: 60 }, { role: "ST", pick: "center" }],
    waves: [["CB", "FB", "GK"], ["DM", "CM"], ["AM", "W", "ST"]],
  },
};

// Resolve a choreography waypoint against the actual scenario positions.
export function resolveBallPath(pieces: Piece[], c: Choreo): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const wp of c.ball) {
    if ("x" in wp) { out.push({ x: wp.x, y: wp.y }); continue; }
    const cands = pieces.filter((p) => p.role === wp.role);
    if (!cands.length) continue; // formation lacks the role — skip the touch
    let pickd = cands[0];
    if (wp.pick === "left") pickd = cands.reduce((a, b) => (a.x < b.x ? a : b));
    else if (wp.pick === "right") pickd = cands.reduce((a, b) => (a.x > b.x ? a : b));
    else if (wp.pick === "high") pickd = cands.reduce((a, b) => (a.y < b.y ? a : b));
    else pickd = cands.reduce((a, b) => (Math.abs(a.x - 50) < Math.abs(b.x - 50) ? a : b));
    out.push({ x: pickd.x, y: pickd.y });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Instant local pre-read: the "quick eval" chips that appear the moment a
// piece is dropped, while the AI engine computes the deep line.
// ---------------------------------------------------------------------------

export interface QuickRead {
  gains: string[];
  risks: string[];
}

const ROLE_WORDS: Record<Role, string> = {
  GK: "keeper", CB: "center back", FB: "fullback", DM: "pivot", CM: "midfielder", AM: "attacking mid", W: "winger", ST: "striker", OPP: "opponent",
};

export function quickRead(piece: Piece, from: { x: number; y: number }, all: Piece[]): QuickRead {
  const dy = piece.y - from.y; // negative = pushed UP toward opponent
  const dx = piece.x - from.x;
  const gains: string[] = [];
  const risks: string[] = [];
  const word = ROLE_WORDS[piece.role];

  if (dy < -8) {
    if (piece.role === "CB") { gains.push("Extra man ahead of the ball — breaks their first line"); risks.push("Space in behind the back line — who slides across?"); }
    if (piece.role === "FB") { gains.push("Width and overlap threat — pins their winger back"); risks.push("Your flank is open on the counter — a mid must cover"); }
    if (piece.role === "DM") { gains.push("Numbers in the press / final third"); risks.push("No screen in front of the defense — their 10 gets the pocket"); }
    if (piece.role === "CM" || piece.role === "AM") { gains.push("Support arrives higher — more bodies in the box"); risks.push("Longer recovery run when it turns over"); }
    if (piece.role === "ST" || piece.role === "W") { gains.push("Stretches their line — more space between their units"); risks.push("Bigger gap back to your midfield — link play gets harder"); }
    if (piece.role === "GK") { gains.push("True +1 in build-up"); risks.push("The long ball over the top is now a footrace to an empty net"); }
  } else if (dy > 8) {
    gains.push(`Deeper ${word} — more security behind the ball`);
    if (piece.role === "ST") risks.push("No depth up top — their line steps up and squeezes you");
    else if (piece.role === "W") risks.push("You've conceded the wing — their fullback is free");
    else risks.push("One fewer option ahead of the ball in possession");
  }
  if (Math.abs(dx) > 12) {
    const inward = Math.abs(piece.x - 50) < Math.abs(from.x - 50);
    if (inward) { gains.push("Central overload — extra body in the half-space"); risks.push("Width lost on that side — switches of play will hurt"); }
    else { gains.push("Real width — stretches their block side to side"); risks.push("Bigger gaps inside for through balls"); }
  }
  // spacing diagnostics against the rest of the shape
  const nearest = Math.min(...all.filter((p) => p.id !== piece.id).map((p) => Math.hypot(p.x - piece.x, p.y - piece.y)));
  if (nearest > 26) risks.push("Isolated — no support angle within a pass");
  if (nearest < 7) risks.push("Two players in one zone — one pass beats both");
  return { gains: gains.slice(0, 2), risks: risks.slice(0, 2) };
}

// Live shape meters — the FIFA-style bars that move while you drag.
export function shapeMeters(pieces: Piece[]): { compact: number; width: number; cover: number } {
  const field = pieces.filter((p) => p.role !== "GK");
  const ys = field.map((p) => p.y);
  const xs = field.map((p) => p.x);
  const vSpread = Math.max(...ys) - Math.min(...ys);
  const hSpread = Math.max(...xs) - Math.min(...xs);
  const behindHalf = field.filter((p) => p.y >= 55).length;
  return {
    compact: Math.round(clamp(100 - (vSpread - 25) * 2.2, 0, 100)),
    width: Math.round(clamp((hSpread - 30) * 1.8, 0, 100)),
    cover: Math.round(clamp((behindHalf / Math.max(3, field.length * 0.45)) * 70, 0, 100)),
  };
}

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
// Sides come from position WITHIN the line (first=L, last=R, middle=C), so
// pairs like [40,60] get L/R shirts instead of two identical labels.
function rows(spec: [Role, number, number[]][]): Piece[] {
  const out: Piece[] = [];
  const counts = new Map<Role, number>();
  for (const [role, y, xs] of spec) {
    xs.forEach((x, i) => {
      const n = (counts.get(role) ?? 0) + 1;
      counts.set(role, n);
      const side = xs.length === 1 ? "" : i === 0 ? "L" : i === xs.length - 1 ? "R" : "C";
      // a 4-across midfield gets the conventional shirts — two "CCM"s would
      // collapse into one map key and stack two players on every paint
      const label = role === "GK" ? "GK"
        : xs.length === 4 && role === "CM" ? ["LM", "LCM", "RCM", "RM"][i]
        : `${side}${role}`.slice(0, 3);
      out.push({ id: `${role}${n}`, role, label, x, y });
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
    id: "9-323", format: "9v9", name: "3-2-3",
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
  { id: "highpress", name: "High Press", emoji: "🌪️", points: ["Force play to ONE side, then trap on the touchline — the sideline is an extra defender.", "Ball-side: lock every short option man-for-man. Weak side: tuck into the middle — the far winger is the one pass you INVITE, it takes three seconds in the air.", "Squeeze the whole team up and slide it toward the ball — the back line holds halfway, keeper sweeps the space behind.", "If they break the first wave, everyone sprints home — no half-pressing."] },
  { id: "midblock", name: "Mid Block", emoji: "🧊", points: ["Compact 30-35 yards front-to-back AND ball-side: the whole block slides toward the ball together.", "Weak-side players tuck inside — you defend the middle and the ball side; the far touchline is the switch you re-shift on.", "The front players screen passing lanes into their pivot.", "The block is a trap, not a rest: win it here and you're 40 yards from goal."] },
  { id: "lowblock", name: "Low Block", emoji: "🏰", points: ["Defend the width of the box, not the width of the pitch — and slide the block to the ball side.", "Nearest defender engages the ball; every other player behind it; one outlet stays alive for the counter.", "Deny the cutback zone — it's the highest-value pass in youth soccer.", "Clear with purpose: to the corner or to the outlet, never through the middle."] },
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

// The zonal-shift principle: out of possession the whole block slides toward
// the ball, lines nearer the ball sliding harder, and NOBODY holds width on
// the weak side — the far winger tucks into the block and re-shifts on the
// switch. `weakCap` is how far from the ball side any player may stay.
function ballSideShift(ps: Piece[], ballX: number, factors: { front: number; mid: number; back: number }, weakCap: number) {
  for (const p of ps) {
    if (p.role === "GK") { p.x = clamp(50 + (ballX - 50) * 0.15, 40, 60); continue; }
    const f = p.y >= 44 ? factors.back : p.y >= 26 ? factors.mid : factors.front;
    p.x = clamp(p.x + (ballX - 50) * f, 4, 96);
    // weak-side tuck: soft-cap distance from the ball side
    if (ballX < 50 && p.x > weakCap) p.x = weakCap + (p.x - weakCap) * 0.25;
    if (ballX > 50 && p.x < 100 - weakCap) p.x = (100 - weakCap) - ((100 - weakCap) - p.x) * 0.25;
  }
}

const distTo = (t: { x: number; y: number }) => (a: Piece, b: Piece) =>
  Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y);

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
        if (central) live.y = by("DM").length ? 50 : 54;
        else { live.y = 46; scaleX(live, 1.3, 8, 92); }
      });
      // Every build-up needs a central receiver between the lines. Shapes
      // with no natural pivot pocket (e.g. two strikers over a lone 6) use
      // the classic answer: one striker drops in, one pins the back line.
      if (!ps.some((p) => p.role !== "GK" && p.y > 32 && p.y < 56 && Math.abs(p.x - 50) < 22)) {
        const dropper = [...by("ST"), ...by("AM"), ...by("W")].sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50))[0];
        if (dropper) { const live = ps.find((p) => p.id === dropper.id)!; live.x = 50; live.y = 44; }
      }
      return resolveCollisions(ps);
    }

    case "highpress": {
      // The wide press trap — the standard modern picture (the pressing
      // schools all teach the same geometry): force play to one side, pin
      // the receiver against the touchline, lock every ball-side lane
      // man-for-man, tuck the weak side into the middle, and hold the back
      // line at halfway with the keeper sweeping behind it.
      const ball = { x: 14, y: 26 }; // their fullback, trapped on our left touchline
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
      // the whole team slides toward the trap; nobody defends the far grass
      ballSideShift(ps, ball.x, { front: 0.55, mid: 0.42, back: 0.3 }, 66);
      // trap jobs: nearest front player presses the ball AT the touchline…
      const front = ps.filter((p) => ["W", "ST", "AM"].includes(p.role)).sort(distTo(ball));
      const presser = front[0];
      if (presser) { presser.x = clamp(ball.x - 2, 6); presser.y = ball.y - 6; }
      // …a striker curves to cut the back-pass to their CB (the cover shadow)…
      const cutter = ps.filter((p) => (p.role === "ST" || p.role === "AM") && p.id !== presser?.id).sort(distTo(ball))[0];
      if (cutter) { cutter.x = clamp(ball.x + 14); cutter.y = clamp(ball.y - 11, 6); }
      // …the nearest mid locks the bounce pass into their pivot…
      const locker = ps.filter((p) => (p.role === "CM" || p.role === "DM") && p.id !== presser?.id && p.id !== cutter?.id).sort(distTo(ball))[0];
      if (locker) { locker.x = clamp(ball.x + 9); locker.y = clamp(ball.y + 9); }
      // …and the ball-side defender squeezes onto the down-the-line lane —
      // a trap with the line pass open isn't a trap.
      const laneCover = ps.filter((p) => (p.role === "FB" || p.role === "CB") && p.id !== locker?.id).sort(distTo(ball))[0];
      if (laneCover) { laneCover.x = clamp(ball.x + 2, 6); laneCover.y = clamp(ball.y + 17); }
      return resolveCollisions(ps);
    }

    case "midblock": {
      // 30 yards front-to-back — and slid TOWARD the ball. A block that
      // stays symmetric while the ball is wide defends nothing; the two
      // banks shift together and the weak side tucks in (re-shift on the
      // switch, don't chase it in the air).
      const ball = { x: 76, y: 28 }; // ball on our right flank, their winger's feet
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
      ballSideShift(ps, ball.x, { front: 0.4, mid: 0.32, back: 0.24 }, 62);
      // nearest front-line player angles out to show the ball down the line,
      // screening the inside pass — the block behind them holds its shape
      const shower = ps.filter((p) => ["ST", "W", "AM"].includes(p.role)).sort(distTo(ball))[0];
      if (shower) { shower.x = clamp(ball.x - 6); shower.y = clamp(ball.y + 8); }
      return resolveCollisions(ps);
    }

    case "lowblock": {
      // Box-width AND ball-side: the near defender engages the ball carrier
      // on the flank, the block slides across behind him, and one outlet
      // stays alive at the halfway line for the clearance.
      const ball = { x: 84, y: 68 }; // their winger working our right flank
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
      ballSideShift(ps, ball.x, { front: 0.3, mid: 0.26, back: 0.2 }, 58);
      // near defender steps out to the ball — deny the cross, don't dive in
      const engager = ps.filter((p) => ["FB", "CB", "W", "CM", "DM"].includes(p.role) && p.id !== outlet?.id).sort(distTo(ball))[0];
      if (engager) { engager.x = clamp(ball.x - 2); engager.y = clamp(ball.y + 4); }
      if (outlet) { const live = ps.find((p) => p.id === outlet.id)!; live.x = 44; live.y = 46; }
      return resolveCollisions(ps);
    }

    case "attTransition": {
      // First 3 seconds after winning it: runners break, wide players STAY
      // wide, rest-defense (2+1 behind the ball) holds — ALWAYS, whatever
      // the shape. One ball lost carelessly must not become a 1v1 with your
      // keeper.
      for (const p of ps) {
        if (p.role === "ST") p.y = clamp(p.y - 18, 6);
        else if (p.role === "W") { p.y = clamp(p.y - 16, 8); scaleX(p, 1.08, 8, 92); }
        else if (p.role === "AM") p.y = clamp(p.y - 12, 12);
        else if (p.role === "CM") p.y = clamp(p.y - 8, 24);
        else if (p.role === "FB") { p.y = clamp(p.y - 6, 30); scaleX(p, 1.05, 6, 94); }
        else if (p.role === "CB") p.y = Math.min(p.y, 64);
        else if (p.role === "GK") p.y = 88;
      }
      // guarantee the 2+1: single-CB shapes keep their deepest mid home
      const home = () => ps.filter((p) => p.role !== "GK" && p.y >= 52);
      const stayers = ps.filter((p) => ["CM", "DM", "FB"].includes(p.role)).sort((a, b) => b.y - a.y);
      for (const sMid of stayers) {
        if (home().length >= 2) break;
        sMid.y = 56; sMid.x = clamp(50 + (sMid.x - 50) * 0.6);
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
      // The wide-overload picture, built as SLOTS so it's correct in every
      // shape — even ones with no wingers or fullbacks. The principles:
      // overload the ball side (carrier + overlap + near support beats their
      // fullback), fill the box arrivals (near post, far post, cutback), keep
      // a pivot recycling and a balance player home for the counter.
      const slots: { x: number; y: number; prefer: Role[] }[] = [
        { x: 86, y: 16, prefer: ["W", "ST", "AM", "CM"] },   // isolated carrier, ball side
        { x: 93, y: 28, prefer: ["FB", "CM", "DM", "W"] },   // overlap outside him
        { x: 58, y: 9, prefer: ["ST", "W", "AM", "CM"] },    // near-post run
        { x: 68, y: 27, prefer: ["AM", "CM", "ST", "W"] },   // cutback zone / near support
        { x: 39, y: 12, prefer: ["W", "ST", "AM", "FB"] },   // far post, arriving late
        { x: 50, y: 32, prefer: ["CM", "AM", "DM"] },        // top of the box
        { x: 56, y: 45, prefer: ["DM", "CM", "FB"] },        // recycling pivot
        { x: 34, y: 52, prefer: ["FB", "DM", "CM"] },        // weak-side balance
        { x: 30, y: 40, prefer: ["CM", "FB", "DM"] },        // spare: weak-side recycle
      ];
      const movers = ps.filter((p) => !["GK", "CB", "OPP"].includes(p.role));
      const taken = new Set<string>();
      for (const slot of slots) {
        const cand = movers
          .filter((p) => !taken.has(p.id))
          .sort((a, b) => {
            const pa = slot.prefer.indexOf(a.role), pb = slot.prefer.indexOf(b.role);
            const ra = pa === -1 ? 9 : pa, rb = pb === -1 ? 9 : pb;
            return ra - rb || Math.hypot(a.x - slot.x, a.y - slot.y) - Math.hypot(b.x - slot.x, b.y - slot.y);
          })[0];
        if (!cand) break;
        taken.add(cand.id);
        cand.x = slot.x; cand.y = slot.y;
      }
      for (const p of ps) {
        if (p.role === "GK") p.y = 90;
        else if (p.role === "CB") { p.y = 60; scaleX(p, 0.8); p.x = clamp(p.x + 5); } // rest defense shades ball-side
      }
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
      let outletUsed = false;
      for (const p of ps) {
        if (p.role === "AM" || p.role === "W") { p.y = 62; scaleX(p, 0.5); }
        else if (p.role === "ST") {
          if (!outletUsed) { p.x = 50; p.y = 48; outletUsed = true; } // the outlet
          else { p.x = 46; p.y = 66; }                       // second striker drops toward the cutback
        } else if (p.role === "GK") p.y = 94;
      }
      // The cutback is the highest-value pass against a box defense — it is
      // ALWAYS owned, whoever has to do it (mid, winger, or second striker).
      if (!ps.some((p) => p.role !== "GK" && p.y > 68 && p.y < 80 && p.x > 38 && p.x < 60)) {
        const owner = ps.filter((p) => ["W", "AM", "ST", "CM", "DM"].includes(p.role) && !(p.x === 50 && p.y === 48)).sort(distTo({ x: 48, y: 74 }))[0];
        if (owner) { owner.x = 48; owner.y = 74; }
      }
      return resolveCollisions(ps);
    }
  }
}

// Where the ball IS in each scenario picture. Defensive shapes are shifted
// toward this point (the zonal-shift doctrine) — showing it is what makes a
// ball-side-leaning block read as coaching instead of chaos.
export const SCENARIO_BALL: Partial<Record<ScenarioId, { x: number; y: number }>> = {
  buildup: { x: 50, y: 88 },
  highpress: { x: 14, y: 26 },
  midblock: { x: 76, y: 28 },
  lowblock: { x: 84, y: 68 },
  attTransition: { x: 46, y: 56 },
  defTransition: { x: 50, y: 42 },
  wideAttack: { x: 86, y: 18 },
  defCross: { x: 16, y: 76 },
};

// ---------------------------------------------------------------------------
// The matchup engine: OUR scenario picture vs THEIR placed shape, resolved
// into the instructions a licensed coach would actually give — per-scenario
// doctrine, not nearest-neighbor guesses. Role discipline is enforced: in a
// high press the FRONT presses their back line, mids lock their pivots, and
// the back line NEVER jumps out of shape. Blocks screen instead of pressing.
// Deterministic and instant; the AI engine layers judgment on top.
// ---------------------------------------------------------------------------

export interface MatchupCallout {
  n: number; // badge number, matches the legend
  kind: "press" | "free" | "exploit" | "danger";
  x: number; // anchor on the pitch (badge position)
  y: number;
  from?: { x: number; y: number }; // our player's spot — draws the assignment arrow
  text: string; // full legend line
}

export interface Matchup {
  callouts: MatchupCallout[];
  ballPath: { x: number; y: number }[]; // where the ball should go vs THIS opponent
}

// Their pieces carry no roles (lone markers never do), so their lines come
// from y-clustering: their goal is y=0, so ascending y = GK, backs, mids,
// front. A gap of >9 grid units separates lines — matches every mirrored
// shape and degrades gracefully for hand-placed markers.
interface OppLines {
  gk: Piece | null;
  back: Piece[]; // their deepest outfield line (build-up CBs/FBs)
  mid: Piece[]; // their pivots / midfield
  front: Piece[]; // their forwards (nearest OUR goal)
  all: Piece[];
}

function classifyOpp(opps: Piece[]): OppLines {
  const sorted = [...opps].sort((a, b) => a.y - b.y);
  const groups: Piece[][] = [];
  for (const o of sorted) {
    const g = groups[groups.length - 1];
    if (g && o.y - g[g.length - 1].y <= 9) g.push(o);
    else groups.push([o]);
  }
  let gk: Piece | null = null;
  if (groups.length > 1 && groups[0].length === 1 && (groups[0][0].y < 20 || groups[1][0].y - groups[0][0].y >= 12)) {
    gk = groups.shift()![0];
  }
  const back = groups[0] ?? [];
  const front = groups.length > 1 ? groups[groups.length - 1] : [];
  const mid = groups.slice(1, Math.max(1, groups.length - 1)).flat();
  return { gk, back, mid, front, all: opps };
}

// Our lines come from authored roles — the scenario pictures set them.
const OUR_FRONT: Role[] = ["ST", "W", "AM"];
const OUR_MID: Role[] = ["CM", "DM"];
const OUR_BACK: Role[] = ["CB", "FB"];

const wordFor = (o: Piece) => (o.label.startsWith("O") && /\d/.test(o.label) ? `#${o.label.slice(1)}` : o.label);

// Greedy role-disciplined assignment: each target gets the nearest UNUSED
// player from the allowed pool, and only if the travel is coachable (<=dist).
function assignJobs(
  targets: Piece[],
  pool: Piece[],
  used: Set<string>,
  maxDist: number,
): { our: Piece; target: Piece }[] {
  const jobs: { our: Piece; target: Piece }[] = [];
  for (const target of targets) {
    const our = pool
      .filter((p) => !used.has(p.id) && Math.hypot(p.x - target.x, p.y - target.y) <= maxDist)
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
    if (!our) continue;
    used.add(our.id);
    jobs.push({ our, target });
  }
  return jobs;
}

const isWide = (p: Piece) => p.x < 28 || p.x > 72;
const byCentral = (a: Piece, b: Piece) => Math.abs(a.x - 50) - Math.abs(b.x - 50);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function matchupCallouts(ours: Piece[], opps: Piece[], scenario: ScenarioId): Matchup {
  const callouts: MatchupCallout[] = [];
  const ballPath: { x: number; y: number }[] = [];
  if (!opps.length || scenario === "base") return { callouts, ballPath };

  const push = (c: Omit<MatchupCallout, "n">) => {
    if (callouts.length < 5) callouts.push({ n: callouts.length + 1, x: clamp(c.x, 4, 96), y: clamp(c.y, 4, 96), ...{ kind: c.kind, from: c.from, text: c.text } });
  };
  const L = classifyOpp(opps);
  const field = ours.filter((p) => p.role !== "GK");
  const ourGK = ours.find((p) => p.role === "GK") ?? null;
  const front = field.filter((p) => OUR_FRONT.includes(p.role));
  const mids = field.filter((p) => OUR_MID.includes(p.role));
  const backs = field.filter((p) => OUR_BACK.includes(p.role));
  const used = new Set<string>();

  // Shared warning: their most advanced runner loose against our last line.
  const runnerWarning = () => {
    const runner = [...L.front, ...L.mid].sort((a, b) => b.y - a.y)[0];
    if (!runner || runner.y < 52) return;
    const marker = [...backs, ...(ourGK ? [ourGK] : [])].sort((a, b) => dist(a, runner) - dist(b, runner))[0];
    if (marker && dist(marker, runner) > 13) {
      push({ kind: "danger", x: runner.x, y: runner.y, from: { x: marker.x, y: marker.y }, text: `Their ${wordFor(runner)} is loose behind us — ${marker.label} goal-side NOW; one ball over the top beats the whole press` });
    }
  };

  // Shared: their unmarked build-up player (the press-breaker).
  const freeOppWarning = (targets: Piece[]) => {
    for (const o of targets) {
      const cover = Math.min(...ours.map((p) => dist(p, o)));
      if (cover > 14) {
        const nearest = [...front, ...mids].sort((a, b) => dist(a, o) - dist(b, o))[0];
        const coachable = nearest && dist(nearest, o) <= 40;
        push({
          kind: "danger", x: o.x, y: o.y,
          from: coachable ? { x: nearest.x, y: nearest.y } : undefined,
          text: coachable
            ? `Their ${wordFor(o)} is FREE — every pass finds him until ${nearest.label} shifts across. Fix it before the restart`
            : `Their ${wordFor(o)} is FREE on the far side — one player can't fix it: the WHOLE press slides across together or you don't press at all`,
        });
        return;
      }
    }
  };

  switch (scenario) {
    // ── HIGH PRESS: front presses their back line (curved runs, touchline
    // trap), mids lock their pivots man-for-man, back line squeezes but
    // NEVER jumps. Doctrine shared by every pressing school.
    case "highpress": {
      const wideBacks = L.back.filter(isWide);
      const centerBacks = L.back.filter((o) => !isWide(o)).sort(byCentral);
      // strikers/central forwards take their CBs
      const cbJobs = assignJobs(centerBacks.slice(0, 2), [...front].sort(byCentral), used, 48);
      // wingers jump their fullbacks — the touchline trap
      const wideFront = front.filter((p) => !used.has(p.id) && (isWide(p) || p.role === "W"));
      const fbJobs = assignJobs(wideBacks.slice(0, 2), wideFront.length ? wideFront : front.filter((p) => !used.has(p.id)), used, 48);
      // nearest mid locks their most central pivot
      const pivot = [...L.mid].sort(byCentral)[0];
      const pivotJob = pivot ? assignJobs([pivot], mids, used, 42) : [];
      freeOppWarning([...centerBacks, ...wideBacks, ...(pivot ? [pivot] : [])]);
      for (const j of cbJobs.slice(0, 2)) {
        push({ kind: "press", x: j.target.x, y: j.target.y, from: { x: j.our.x, y: j.our.y }, text: `${j.our.label} presses their ${wordFor(j.target)} with a curved run — show him ONE way and cover-shadow the pivot behind you` });
      }
      for (const j of fbJobs.slice(0, 1)) {
        push({ kind: "press", x: j.target.x, y: j.target.y, from: { x: j.our.x, y: j.our.y }, text: `${j.our.label} jumps their ${wordFor(j.target)} the moment the pass travels — the touchline is your extra defender, trap him there` });
      }
      for (const j of pivotJob) {
        push({ kind: "press", x: j.target.x, y: j.target.y, from: { x: j.our.x, y: j.our.y }, text: `${j.our.label} locks their ${wordFor(j.target)} touch-tight — the bounce pass through the middle is how presses die` });
      }
      if (cbJobs.length + fbJobs.length + pivotJob.length === 0) {
        // both teams are set up to press — a pressing duel. The instruction
        // survives: the front two hunt their deepest ball-players on the
        // turnover; no arrows, the distances close the moment the ball moves.
        const deepest = [...L.back, ...(L.gk ? [L.gk] : [])].sort((a, b) => a.y - b.y).slice(0, 2);
        const hunters = [...front].sort(byCentral).slice(0, 2);
        deepest.slice(0, hunters.length).forEach((t, i) => {
          push({ kind: "press", x: t.x, y: t.y, text: `${hunters[i].label} presses their ${wordFor(t)} the second the ball turns over — they're pressing too, so this is a duel: first team to the ball wins the game` });
        });
      }
      runnerWarning();
      // route: keeper → pressed CB → forced to the trapped FB → we win → break
      const trap = fbJobs[0]?.target ?? cbJobs[0]?.target ?? L.back[0];
      if (trap) {
        if (L.gk) ballPath.push({ x: L.gk.x, y: L.gk.y });
        const via = cbJobs[0]?.target;
        if (via && via !== trap) ballPath.push({ x: via.x, y: via.y });
        ballPath.push({ x: trap.x, y: trap.y }, { x: clamp(trap.x), y: clamp(trap.y + 8) });
        const breaker = front.find((p) => !used.has(p.id)) ?? front[0];
        if (breaker) ballPath.push({ x: breaker.x, y: breaker.y });
        ballPath.push({ x: 50, y: 8 });
      }
      break;
    }

    // ── MID BLOCK: nobody chases their back line. The front SCREENS the
    // pivot lanes, the block shifts on the wide pass, and the entry pass
    // into midfield is the pressing trigger.
    case "midblock": {
      const pivot = [...L.mid].sort(byCentral)[0];
      const screener = [...front].sort(byCentral)[0];
      if (pivot && screener && dist(screener, pivot) <= 40) {
        used.add(screener.id);
        push({ kind: "press", x: pivot.x, y: pivot.y, from: { x: screener.x, y: screener.y }, text: `${screener.label} screens the lane into their ${wordFor(pivot)} — let their CBs have it, deny the middle, force play around the block` });
      }
      const wideBack = L.back.filter(isWide).sort((a, b) => b.x - a.x)[0] ?? L.back[0];
      if (wideBack) {
        const shifter = front.filter((p) => !used.has(p.id)).sort((a, b) => dist(a, wideBack) - dist(b, wideBack))[0];
        if (shifter && dist(shifter, wideBack) <= 40) {
          used.add(shifter.id);
          push({ kind: "press", x: wideBack.x, y: wideBack.y, from: { x: shifter.x, y: shifter.y }, text: `The pass to their ${wordFor(wideBack)} is the shift trigger — ${shifter.label} angles out to show him down the line and the WHOLE block slides with the ball` });
        }
      }
      const receiver = [...L.mid].sort((a, b) => b.y - a.y)[0];
      if (receiver) {
        const ambusher = mids.sort((a, b) => dist(a, receiver) - dist(b, receiver))[0];
        if (ambusher && dist(ambusher, receiver) <= 40) {
          push({ kind: "press", x: receiver.x, y: receiver.y, from: { x: ambusher.x, y: ambusher.y }, text: `The entry pass into their ${wordFor(receiver)} is the TRAP — ${ambusher.label} arrives on his first touch, from behind, ball side` });
        }
      }
      // they're parked in their own half — there's nothing to screen yet
      if (!callouts.some((c) => c.kind === "press")) {
        const stepper = [...front].sort(byCentral)[0];
        if (stepper) {
          push({ kind: "free", x: stepper.x, y: clamp(stepper.y - 10), from: { x: stepper.x, y: stepper.y }, text: `They're camped in their own half — the block shifts up to halfway TOGETHER, ${stepper.label} sets the line; any ball over the top is the keeper's` });
        }
      }
      runnerWarning();
      const outlet = [...front].sort((a, b) => a.y - b.y)[0];
      if (outlet && callouts.length < 5) {
        push({ kind: "free", x: outlet.x, y: outlet.y, text: `${outlet.label} stays connected to the block — win it here and you're 40 yards from goal with him as the out-ball` });
      }
      // route: their circulation wide, entry pass, our trap, counter
      if (wideBack && receiver) {
        const start = L.back.sort(byCentral)[0];
        if (start && start !== wideBack) ballPath.push({ x: start.x, y: start.y });
        ballPath.push({ x: wideBack.x, y: wideBack.y }, { x: receiver.x, y: receiver.y });
        if (outlet) ballPath.push({ x: outlet.x, y: outlet.y });
        ballPath.push({ x: 50, y: 10 });
      }
      break;
    }

    // ── LOW BLOCK: engage the wide carrier, own the cutback zone, mark the
    // box men goal-side, keep the outlet alive.
    case "lowblock": {
      // only players actually threatening our half get engaged — a low block
      // never chases into the opponent's half
      const advanced = opps.filter((o) => o.y > 48);
      const carrier = advanced.filter(isWide).sort((a, b) => b.y - a.y)[0] ?? [...advanced].sort((a, b) => b.y - a.y)[0];
      if (carrier) {
        const engager = field.filter((p) => p.y > 50).sort((a, b) => dist(a, carrier) - dist(b, carrier))[0];
        if (engager && dist(engager, carrier) <= 35) {
          used.add(engager.id);
          push({ kind: "press", x: carrier.x, y: carrier.y, from: { x: engager.x, y: engager.y }, text: `${engager.label} closes their ${wordFor(carrier)} — force him BACKWARD, never dive in; a beaten defender here is a shot` });
        }
      } else {
        const organizer = backs.sort(byCentral)[0];
        if (organizer) {
          push({ kind: "free", x: organizer.x, y: clamp(organizer.y - 14), from: { x: organizer.x, y: organizer.y }, text: `Nobody is threatening our half — the block squeezes up to halfway TOGETHER, ${organizer.label} sets the line; defending your box against nobody just invites pressure` });
        }
      }
      const boxMen = L.front.filter((o) => o.y > 60 && o.x > 28 && o.x < 72).slice(0, 2);
      const markJobs = assignJobs(boxMen, backs, used, 25);
      for (const j of markJobs.slice(0, 2)) {
        push({ kind: "press", x: j.target.x, y: j.target.y, from: { x: j.our.x, y: j.our.y }, text: `${j.our.label} owns their ${wordFor(j.target)} in the box — goal-side, touch-tight, and ATTACK the first contact on any cross` });
      }
      const cutbackPool = [...mids.filter((p) => !used.has(p.id)), ...front.filter((p) => !used.has(p.id)), ...backs.filter((p) => !used.has(p.id))];
      const cutbackOwner = cutbackPool.sort((a, b) => dist(a, { x: 50, y: 74 }) - dist(b, { x: 50, y: 74 }))[0];
      if (cutbackOwner) {
        push({ kind: "exploit", x: 50, y: 74, from: { x: cutbackOwner.x, y: cutbackOwner.y }, text: `${cutbackOwner.label} owns the cutback zone at the top of the box — it's the highest-value pass in youth soccer and it's HIS` });
      }
      const outlet = [...field].sort((a, b) => a.y - b.y)[0];
      if (outlet && outlet.y < 55) {
        push({ kind: "free", x: outlet.x, y: outlet.y, text: `${outlet.label} stays alive at halfway — every clearance targets him, chest or feet, never hopeful` });
      }
      if (carrier) {
        ballPath.push({ x: carrier.x, y: carrier.y }, { x: clamp(carrier.x > 50 ? carrier.x - 20 : carrier.x + 20), y: 86 }, { x: 50, y: 80 });
        if (outlet) ballPath.push({ x: outlet.x, y: outlet.y });
      }
      break;
    }

    // ── COUNTER-PRESS: nearest 2-3 hunt the loss point, the escape lane is
    // cut FIRST, everyone else drops and narrows.
    case "defTransition": {
      const loss = { x: 50, y: 42 };
      const hunters = field.filter((p) => dist(p, loss) < 14).slice(0, 3);
      hunters.forEach((h) => used.add(h.id));
      if (hunters[0]) {
        push({ kind: "press", x: loss.x, y: loss.y, from: { x: hunters[0].x, y: hunters[0].y }, text: `Ball lost HERE — ${hunters.map((h) => h.label).join(" + ")} hunt for five seconds: curve the runs, trap the ball, don't slide` });
      }
      const escape = [...opps].sort((a, b) => dist(a, loss) - dist(b, loss))[0];
      if (escape) {
        const cutter = field.filter((p) => !used.has(p.id)).sort((a, b) => dist(a, escape) - dist(b, escape))[0] ?? hunters[1];
        push({ kind: "danger", x: escape.x, y: escape.y, from: cutter ? { x: cutter.x, y: cutter.y } : undefined, text: `Their ${wordFor(escape)} is the escape lane — ${cutter?.label ?? "the second presser"} cuts HIM off first; kill the out-ball and the press wins` });
      }
      const deepest = [...backs].sort(byCentral)[0];
      if (deepest) {
        push({ kind: "free", x: deepest.x, y: deepest.y, text: `Everyone outside the hunt drops two lines and narrows — ${deepest.label} organizes it; if the five seconds fail, sprint home, no half-pressing` });
      }
      runnerWarning();
      ballPath.push(loss);
      if (escape) ballPath.push({ x: escape.x, y: escape.y }, { x: clamp(escape.x), y: clamp(escape.y - 6) });
      const breaker = front.filter((p) => !used.has(p.id))[0] ?? front[0];
      if (breaker) ballPath.push({ x: breaker.x, y: breaker.y }, { x: 50, y: 10 });
      break;
    }

    // ── DEFENDING THE CROSS: pressure the crosser, zonal front post, mark
    // the arrivals, own the cutback, track the back post.
    case "defCross": {
      const crossSpot = { x: 16, y: 76 };
      const presser = field.filter((p) => p.y > 55).sort((a, b) => dist(a, crossSpot) - dist(b, crossSpot))[0];
      if (presser) {
        used.add(presser.id);
        push({ kind: "press", x: crossSpot.x, y: crossSpot.y, from: { x: presser.x, y: presser.y }, text: `${presser.label} pressures the crosser — take away the DRIVEN ball; a floated cross is a keeper's ball at this age` });
      }
      const arrivals = L.front.filter((o) => o.y > 62).sort((a, b) => b.y - a.y).slice(0, 2);
      const marks = assignJobs(arrivals, backs, used, 34);
      for (const j of marks.slice(0, 2)) {
        push({ kind: "press", x: j.target.x, y: j.target.y, from: { x: j.our.x, y: j.our.y }, text: `${j.our.label} bodies their ${wordFor(j.target)} — goal-side and inside the line of the ball; first contact WINS` });
      }
      const backPost = L.front.filter((o) => o.x > 55).sort((a, b) => b.x - a.x)[0];
      if (backPost && !arrivals.includes(backPost)) {
        const tracker = backs.filter((p) => !used.has(p.id)).sort((a, b) => dist(a, backPost) - dist(b, backPost))[0];
        const coachable = tracker && dist(tracker, backPost) <= 35;
        push({
          kind: "danger", x: backPost.x, y: backPost.y,
          from: coachable ? { x: tracker.x, y: tracker.y } : undefined,
          text: coachable
            ? `Their ${wordFor(backPost)} drifts to the back post — ${tracker.label} tracks him; that's where youth crosses actually land`
            : `Their ${wordFor(backPost)} lurks at the back post and nobody's spare — the whole line drops a step and the keeper OWNS anything floated there`,
        });
      }
      const cb = [...mids.filter((p) => !used.has(p.id)), ...front.filter((p) => !used.has(p.id)), ...backs.filter((p) => !used.has(p.id))]
        .sort((a, b) => dist(a, { x: 48, y: 74 }) - dist(b, { x: 48, y: 74 }))[0];
      if (cb) push({ kind: "exploit", x: 48, y: 74, from: { x: cb.x, y: cb.y }, text: `${cb.label} owns the cutback zone — when the byline pass comes square, he's already there` });
      ballPath.push(crossSpot, { x: 44, y: 86 }, { x: 55, y: 78 });
      const outlet = [...field].sort((a, b) => a.y - b.y)[0];
      if (outlet) ballPath.push({ x: outlet.x, y: outlet.y });
      break;
    }

    // ── BUILD-UP: the numbers game in the first line, the free man between
    // their lines, and the gate through their press.
    case "buildup": {
      const pressers = L.front.filter((o) => o.y > 50);
      const buildUnit = [...backs.filter((p) => p.y > 55), ...(ourGK ? [ourGK] : [])];
      const plus = buildUnit.length - pressers.length;
      const anchor = ourGK ?? buildUnit[0] ?? field[0];
      if (pressers.length > 0 && anchor) {
        push({
          kind: plus > 0 ? "free" : "danger",
          x: anchor.x, y: anchor.y,
          text: plus > 0
            ? `Numbers: ${buildUnit.length}v${pressers.length} in the first line — you have +${plus}. Be brave, the spare man ALWAYS comes free; find him and the press is beaten`
            : `Numbers: ${buildUnit.length}v${pressers.length} in the first line — no spare man. Don't build short into an even press: bounce it off the 9 or go long to the far side`,
        });
      }
      // the free man between their pressing wave and their second line
      const frontYs = L.front.map((o) => o.y);
      const midYs = L.mid.map((o) => o.y);
      const pocketTop = midYs.length ? Math.max(...midYs) : 40;
      const pocketBottom = frontYs.length ? Math.min(...frontYs) : 65;
      const freeMan = field
        .filter((p) => p.y > pocketTop + 3 && p.y < pocketBottom - 3 && Math.min(...opps.map((o) => dist(o, p))) > 11)
        .sort(byCentral)[0];
      if (freeMan) {
        push({ kind: "free", x: freeMan.x, y: freeMan.y, text: `${freeMan.label} is between their lines with nobody touch-tight — the pass into HIM breaks two lines at once; receive half-turned` });
      }
      // the widest gate in their pressing front
      if (pressers.length >= 2) {
        const xs = [6, ...pressers.map((o) => o.x).sort((a, b) => a - b), 94];
        let bestW = 0, bestX = 50;
        for (let i = 1; i < xs.length; i++) {
          if (xs[i] - xs[i - 1] > bestW) { bestW = xs[i] - xs[i - 1]; bestX = (xs[i] + xs[i - 1]) / 2; }
        }
        if (bestW >= 16) {
          const carrier = backs.sort((a, b) => Math.abs(a.x - bestX) - Math.abs(b.x - bestX))[0];
          push({ kind: "exploit", x: clamp(bestX, 8, 92), y: clamp((pressers.reduce((s, o) => s + o.y, 0) / pressers.length) - 8, 30), from: carrier ? { x: carrier.x, y: carrier.y } : undefined, text: `Their press has a ${Math.round(bestW)}-wide gate here — ${carrier ? `${carrier.label} drives through it on the dribble` : "drive through it"}; a defender carrying beats a press no pass can` });
        }
      }
      runnerWarning();
      // route: GK → spare back → free man / gate → forward
      if (anchor) {
        ballPath.push({ x: anchor.x, y: anchor.y });
        const spare = backs.filter((p) => Math.min(...opps.map((o) => dist(o, p))) > 10).sort((a, b) => b.y - a.y)[0];
        if (spare) ballPath.push({ x: spare.x, y: spare.y });
        if (freeMan) ballPath.push({ x: freeMan.x, y: freeMan.y });
        const target = [...front].sort(byCentral)[0];
        if (target && target !== freeMan) ballPath.push({ x: target.x, y: target.y });
        ballPath.push({ x: 50, y: 10 });
      }
      break;
    }

    // ── ATTACKING TRANSITION: first pass into the outlet's FEET, runners
    // beyond, and an honest count against their rest defense.
    case "attTransition": {
      const outlet = [...front].sort(byCentral)[0];
      if (outlet) {
        push({ kind: "free", x: outlet.x, y: outlet.y, text: `First pass goes INTO ${outlet.label} — feet, not space; he sets it and the picture opens. Three passes, ten seconds, shot` });
      }
      const theirRest = L.back.filter((o) => o.y < 50);
      const runners = front.filter((p) => p !== outlet && p.y < 35).slice(0, 2);
      if (runners.length && theirRest.length) {
        const r0 = runners[0];
        push({
          kind: runners.length >= theirRest.length ? "exploit" : "press",
          x: r0.x, y: clamp(r0.y - 8),
          from: { x: r0.x, y: r0.y },
          text: `${runners.map((r) => r.label).join(" + ")} sprint beyond their last ${theirRest.length} — it's ${runners.length}v${theirRest.length} back there${runners.length >= theirRest.length ? ": commit, this is the goal moment" : ": one more runner or keep the ball"}`,
        });
      }
      // the channel their recovery leaves open
      if (theirRest.length >= 2) {
        const xs = [8, ...theirRest.map((o) => o.x).sort((a, b) => a - b), 92];
        let bestW = 0, bestX = 50;
        for (let i = 1; i < xs.length; i++) {
          if (xs[i] - xs[i - 1] > bestW) { bestW = xs[i] - xs[i - 1]; bestX = (xs[i] + xs[i - 1]) / 2; }
        }
        if (bestW >= 18) push({ kind: "exploit", x: clamp(bestX, 10, 90), y: clamp(Math.min(...theirRest.map((o) => o.y)) - 8, 6), text: `Their recovery leaves a ${Math.round(bestW)}-wide channel — the through ball goes THERE before they set` });
      }
      const home = field.filter((p) => p.y >= 50);
      if (home.length < 2 && backs[0]) {
        push({ kind: "danger", x: backs[0].x, y: backs[0].y, text: `Rest defense is light — ${backs.map((b) => b.label).slice(0, 2).join(" + ")} do NOT join; lose this ball and it's a footrace at our goal` });
      }
      const win = { x: 46, y: 56 };
      ballPath.push(win);
      if (outlet) ballPath.push({ x: outlet.x, y: outlet.y });
      if (runners[0]) ballPath.push({ x: runners[0].x, y: clamp(runners[0].y - 10) });
      ballPath.push({ x: 50, y: 8 });
      break;
    }

    // ── WIDE ATTACK: count the overload flank, isolate the weak side,
    // and beat the block with the cutback, not the floated cross.
    case "wideAttack": {
      const flankOurs = field.filter((p) => p.x >= 60);
      const flankTheirs = opps.filter((o) => o.x >= 55 && o.y < 60);
      const carrier = flankOurs.sort((a, b) => b.x - a.x)[0];
      if (carrier) {
        push({
          kind: flankOurs.length > flankTheirs.length ? "exploit" : "press",
          x: carrier.x, y: carrier.y,
          text: `${flankOurs.length}v${flankTheirs.length} on the overload side — ${flankOurs.length > flankTheirs.length ? `they can't cover it: ${carrier.label} takes his man on or plays the overlap` : `even numbers: ${carrier.label} waits for the overlap before committing`}`,
        });
      }
      const weakSideDef = opps.filter((o) => o.x < 45 && o.y < 60);
      const farPost = field.filter((p) => p.x < 45 && p.y < 30).sort((a, b) => a.x - b.x)[0];
      if (farPost && weakSideDef.length <= 1) {
        push({ kind: "free", x: farPost.x, y: farPost.y, text: `Their weak side is ${weakSideDef.length === 0 ? "EMPTY" : "1v1"} — ${farPost.label} holds the far post until the last second; the early switch is a free shot` });
      }
      const theirLine = classifyOpp(opps).back;
      const deepBlock = theirLine.length > 0 && theirLine.every((o) => o.y > 8) && (L.gk ? theirLine[0].y - L.gk.y < 20 : true);
      const cutbackMan = field.filter((p) => p.y > 24 && p.y < 42 && p.x > 40 && p.x < 70).sort(byCentral)[0];
      if (cutbackMan && deepBlock) {
        push({ kind: "exploit", x: cutbackMan.x, y: cutbackMan.y, text: `They're dropping onto their box — the CUTBACK to ${cutbackMan.label} beats the floated cross every time at youth level; byline, then square` });
      }
      const theirOutlet = [...L.front, ...L.mid].filter((o) => o.y > 45).sort((a, b) => b.y - a.y)[0];
      const balance = theirOutlet ? field.filter((p) => p.y >= 48).sort((a, b) => dist(a, theirOutlet) - dist(b, theirOutlet))[0] : undefined;
      if (theirOutlet && balance) {
        const coachable = dist(balance, theirOutlet) <= 40;
        push({
          kind: "danger", x: theirOutlet.x, y: theirOutlet.y,
          from: coachable ? { x: balance.x, y: balance.y } : undefined,
          text: coachable
            ? `Their ${wordFor(theirOutlet)} waits for the counter — ${balance.label} stays touch-tight while we attack; the cross we lose becomes THEIR chance`
            : `Their ${wordFor(theirOutlet)} waits for the counter with nobody near — keep the rest-defense honest: the back line shades his side while we attack`,
        });
      }
      const pivotBall = field.filter((p) => p.y > 40 && p.y < 55).sort(byCentral)[0];
      if (pivotBall) ballPath.push({ x: pivotBall.x, y: pivotBall.y });
      if (carrier) ballPath.push({ x: carrier.x, y: carrier.y }, { x: clamp(carrier.x + 5, 10, 94), y: clamp(carrier.y - 12, 8) });
      if (cutbackMan && deepBlock) ballPath.push({ x: cutbackMan.x, y: cutbackMan.y });
      else if (farPost) ballPath.push({ x: farPost.x, y: farPost.y });
      ballPath.push({ x: 50, y: 6 });
      break;
    }

    default:
      break;
  }

  // Every matchup produces SOMETHING useful — a blank board teaches nothing.
  if (callouts.length === 0) {
    const leftLoad = opps.filter((o) => o.x < 50).length;
    const lightX = leftLoad > opps.length / 2 ? 78 : 22;
    const wide = field.filter((p) => (lightX > 50 ? p.x > 55 : p.x < 45)).sort((a, b) => a.y - b.y)[0];
    push({ kind: "exploit", x: wide ? wide.x : lightX, y: wide ? wide.y : 40, text: `They're loaded ${leftLoad > opps.length / 2 ? "left" : "right"} — two-touch circulation and switch to ${wide ? wide.label : "the far side"} before their block shifts across` });
  }
  if (ballPath.length === 1) ballPath.length = 0;
  for (const p of ballPath) { p.x = clamp(p.x, 4, 96); p.y = clamp(p.y, 4, 96); }
  return { callouts, ballPath };
}

// ---------------------------------------------------------------------------
// Text -> scenario: keyword matcher used by DEMO mode to pick the closest
// authored picture for a described situation. The live engine paints the
// exact scenario; this keeps the board alive without a key. Order matters —
// more specific intents are tested before generic keywords.
// ---------------------------------------------------------------------------

export function scenarioFromText(text: string): ScenarioId | null {
  const t = text.toLowerCase();
  const table: [ScenarioId, RegExp][] = [
    ["defCross", /defend(ing)?\s+(the\s+)?(cross|box|corner)|defend(ing)? set pieces|stop .{0,24}cross|(they|their) .{0,16}cross(es)?\b|crosses? (against|(are )?coming)|corner(s)? against|box defend/],
    ["defTransition", /counter.?press|after (losing|we lose)|lost the ball|lose the ball|5.second|react.*turnover|win it back (right away|immediately)/],
    ["lowblock", /low block|park (the )?bus|\bparked\b|deep block|bunker|defend (a |the )?lead|see (it|the game) out|hold (on|the lead)|protect the lead|kill the game|(we'?re|we are) (up|winning) \d+\D{0,2}\d+|(they|their).{0,30}(throwing (numbers|everyone|players)|everyone forward)/],
    ["attTransition", /counter.?attack|fast break|break (quickly|fast)|transition to attack|win the ball.*(counter|go|fast|quick)|moment we win/],
    ["midblock", /mid block|midblock|sit mid|medium block|shift together|compact.*(middle|block)|screen.*pivot/],
    ["highpress", /high press|press (their|them|the keeper|the goalie)|we press|press(ing)? (them |the )?high\b|trap.*touchline|touchline.*trap|force.*wide.*(trap|press)|win it high/],
    ["buildup", /they press us|press us|build.?out|build.?up|play(ing)? out|goal kick|from the back|beat (the|their) press|break (the|their) press|first line/],
    ["wideAttack", /wide|overload|byline|cutback|cross(es|ing)? (from|into)|flank|isolat.*(winger|back)|switch.*attack/],
  ];
  for (const [id, rx] of table) if (rx.test(t)) return id;
  return null;
}

// ---------------------------------------------------------------------------
// Verified geometric facts: the numbers the AI must never get wrong, computed
// here and handed to the model as ground truth. The math feeds facts IN and
// validates paint coming OUT — the AI does all the talking in between.
// ---------------------------------------------------------------------------

export function geometryFacts(ours: Piece[], opps: Piece[]): string[] {
  const facts: string[] = [];
  const field = ours.filter((p) => p.role !== "GK" && p.role !== "OPP");
  const gk = ours.find((p) => p.role === "GK");
  if (field.length < 3) return facts;

  const band = (ps: { y: number }[], lo: number, hi: number) => ps.filter((p) => p.y >= lo && p.y < hi).length;
  facts.push(`Our shape by thirds (excl. GK): ${band(field, 62, 101)} defensive / ${band(field, 38, 62)} middle / ${band(field, 0, 38)} attacking`);
  if (gk) facts.push(`Our GK is at [${Math.round(gk.x)},${Math.round(gk.y)}]${gk.y < 60 ? " — UPFIELD, the goal is unguarded" : ""}`);

  const ys = field.map((p) => p.y).sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < ys.length; i++) gap = Math.max(gap, ys[i] - ys[i - 1]);
  if (gap > 25) facts.push(`Largest vertical gap between our lines: ${Math.round(gap)} grid units`);

  const meanX = field.reduce((s, p) => s + p.x, 0) / field.length;
  if (Math.abs(meanX - 50) > 12) facts.push(`Our shape leans ${meanX < 50 ? "left" : "right"} (mean x=${Math.round(meanX)})`);

  // >36: stock shapes legitimately reach 35.4 (a 4-2-3-1 winger holding
  // width) — the flag is for genuinely stranded players, never a base picture
  const isolated = field.filter((p) => Math.min(...field.filter((q) => q.id !== p.id).map((q) => Math.hypot(q.x - p.x, q.y - p.y))) > 36);
  if (isolated.length) facts.push(`Isolated (no teammate within a pass): ${isolated.map((p) => p.label).join(", ")}`);

  if (opps.length) {
    facts.push(`Their shape by thirds (from our view): ${band(opps, 62, 101)} in our defensive third / ${band(opps, 38, 62)} middle / ${band(opps, 0, 38)} in their defensive third`);
    const ourFree = field.filter((p) => Math.min(...opps.map((o) => Math.hypot(o.x - p.x, o.y - p.y))) > 12).map((p) => p.label);
    if (ourFree.length) facts.push(`OUR players with no opponent within 12 units: ${ourFree.join(", ")}`);
    const theirFree = opps.filter((o) => Math.min(...ours.map((p) => Math.hypot(p.x - o.x, p.y - o.y))) > 13).map((o) => o.label);
    if (theirFree.length) facts.push(`THEIR unmarked players: ${theirFree.join(", ")}`);
    const ourBuild = field.filter((p) => ["CB", "FB"].includes(p.role) && p.y > 55).length + (gk ? 1 : 0);
    const theirAdvanced = opps.filter((o) => o.y > 50).length;
    if (theirAdvanced > 0) facts.push(`First-line numbers if we build short: ${ourBuild}v${theirAdvanced} ${ourBuild > theirAdvanced ? `(+${ourBuild - theirAdvanced} for us)` : ourBuild === theirAdvanced ? "(even — no spare man)" : "(we are OUTNUMBERED)"}`);
  }
  return facts.slice(0, 10);
}

// A whole-board read of a hand-made change: what moving these players GAINED,
// what it COST, and an overall read of the RESULTING shape. Whole-board aware
// (it recomputes the shape after the move) so it never gives the context-free
// per-piece lines the old drag pop-up did. This is the demo fallback for the
// AI move-read and a validator target; live, the engine does the real read.
export interface MoveRead {
  gains: string[];
  costs: string[];
  overall: string;
  verdict: "better" | "tradeoff" | "risky";
}

const ROLE_WORD: Record<Role, string> = {
  GK: "keeper", CB: "center back", FB: "fullback", DM: "pivot", CM: "midfielder",
  AM: "attacking mid", W: "winger", ST: "striker", OPP: "opponent",
};

export function moveRead(prev: Piece[], cur: Piece[], opps: Piece[] = []): MoveRead {
  const gains: string[] = [];
  const costs: string[] = [];
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const moved = cur.filter((p) => { const b = prevById.get(p.id); return b && Math.hypot(p.x - b.x, p.y - b.y) > 3; });

  for (const p of moved) {
    const b = prevById.get(p.id)!;
    const dy = p.y - b.y; // negative = toward THEIR goal (up the pitch)
    const dx = p.x - b.x;
    const word = ROLE_WORD[p.role] ?? "player";
    if (p.role === "GK" && p.y < 55) {
      costs.push("Your keeper is off the line — the goal is open, any turnover is a chance against");
      continue;
    }
    if (dy < -8) {
      if (p.role === "CB") { gains.push("An extra man ahead of the ball to break their first line"); costs.push("Space in behind your back line — someone has to cover the run"); }
      else if (p.role === "FB") { gains.push("Width and an overlap high — their winger gets pinned back"); costs.push("That flank is open on the counter until a midfielder tucks across"); }
      else if (p.role === "DM") { gains.push("More bodies around the ball high up the pitch"); costs.push("No screen in front of the back line — their 10 lives in the pocket"); }
      else if (p.role === "ST" || p.role === "W") { gains.push("Stretches their line and pins their backs deeper"); costs.push("A bigger gap back to midfield — the link play gets harder"); }
      else { gains.push(`Your ${word} supports higher — more presence in the final third`); costs.push("A longer recovery run when the ball turns over"); }
    } else if (dy > 8) {
      gains.push(`A deeper ${word} — more security behind the ball`);
      if (p.role === "ST") costs.push("No one pinning their line — they step up and squeeze you");
      else if (p.role === "W") costs.push("You've conceded that wing — their fullback is free to push");
      else costs.push("One fewer option ahead of the ball in possession");
    }
    if (Math.abs(dx) > 12) {
      const inward = Math.abs(p.x - 50) < Math.abs(b.x - 50);
      if (inward) { gains.push("An extra body in the central half-space"); costs.push("Width lost on that side — a switch of play will hurt"); }
      else { gains.push("Real width to stretch their block side to side"); costs.push("Bigger gaps inside for a pass through the lines"); }
    }
  }

  // whole-board diagnostics on the resulting shape
  const field = cur.filter((p) => p.role !== "GK" && p.role !== "OPP");
  const gk = cur.find((p) => p.role === "GK");
  const def = field.filter((p) => p.y >= 62).length;
  const mid = field.filter((p) => p.y >= 38 && p.y < 62).length;
  const att = field.filter((p) => p.y < 38).length;
  const structure = `${def}-${mid}-${att}`;
  if (gk && gk.y < 60 && !costs.some((c) => /keeper/.test(c))) costs.push("Your keeper is upfield — the goal is unguarded");
  if (att >= 3 && mid <= 1) costs.push(`${att} committed ahead of the ball with ${mid === 0 ? "no one" : "one player"} linking — defense and attack are split`);
  if (def === 0 && field.length) costs.push("No one is holding the back line — a turnover runs straight at goal");
  const ys = field.map((p) => p.y).sort((a, b) => a - b);
  let gap = 0, gapAt = 50;
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > gap) { gap = ys[i] - ys[i - 1]; gapAt = (ys[i] + ys[i - 1]) / 2; }
  if (gap > 30) costs.push(`A ${Math.round(gap)}-unit hole through the ${gapAt < 45 ? "attacking" : gapAt > 60 ? "defensive" : "middle"} third — one pass splits the team`);
  const meanX = field.length ? field.reduce((s, p) => s + p.x, 0) / field.length : 50;
  if (Math.abs(meanX - 50) > 16) costs.push(`The shape leans ${meanX < 50 ? "left" : "right"} — the far side is one switch from being wide open`);
  const isolated = field.filter((p) => Math.min(999, ...field.filter((q) => q.id !== p.id).map((q) => Math.hypot(q.x - p.x, q.y - p.y))) > 34);
  if (isolated.length) costs.push(`${isolated.map((p) => p.label).join(" + ")} ${isolated.length === 1 ? "is" : "are"} stranded — no teammate within a pass`);

  const g = [...new Set(gains)].slice(0, 3);
  const c = [...new Set(costs)].slice(0, 3);
  if (!moved.length) return { gains: [], costs: [], overall: "Nothing has moved from the painted shape — drag a player to see the trade.", verdict: "tradeoff" };
  if (!g.length && !c.length) g.push("A connected shape — every line within a pass of the next, both flanks honest");
  const risky = c.some((x) => /keeper|no one|split|straight at goal/.test(x)) || (c.length >= 2 && g.length <= 1);
  const verdict: MoveRead["verdict"] = risky ? "risky" : g.length && c.length ? "tradeoff" : g.length > c.length ? "better" : "tradeoff";
  const lead = verdict === "risky" ? `This ${structure} has a problem to fix before anything else`
    : verdict === "better" ? `A stronger ${structure} — the gain outweighs what you gave up`
      : `A ${structure} trade — you gained one thing and conceded another`;
  return { gains: g, costs: c, overall: lead + "." + (opps.length ? " Weigh it against the shirts you placed." : ""), verdict };
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

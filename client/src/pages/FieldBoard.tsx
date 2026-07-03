import { useRef, useState } from "react";
import type { DrillDiagram, Movement, Point } from "../types";
import { PitchDiagram } from "../components/PitchDiagram";

type Tool = "attacker" | "defender" | "ball" | "cone" | "pass" | "run" | "dribble" | "erase";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "attacker", label: "🟠 Attacker" },
  { id: "defender", label: "🔵 Defender" },
  { id: "ball", label: "⚪ Ball" },
  { id: "cone", label: "🔺 Cone" },
  { id: "pass", label: "➡️ Pass" },
  { id: "run", label: "🏃 Run" },
  { id: "dribble", label: "⚡ Dribble" },
  { id: "erase", label: "🧽 Erase" },
];

const EMPTY: DrillDiagram = { attackers: [], defenders: [], neutrals: [], cones: [], balls: [], goals: [{ x: 50, y: 2 }, { x: 50, y: 98 }], movements: [] };

// Interactive tactics board: place players, draw movements, watch it animate live.
export function FieldBoard() {
  const [diagram, setDiagram] = useState<DrillDiagram>(structuredClone(EMPTY));
  const [tool, setTool] = useState<Tool>("attacker");
  const [pending, setPending] = useState<Point | null>(null);
  const svgWrap = useRef<HTMLDivElement>(null);

  function coords(e: React.MouseEvent): Point {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    // The viewBox is square; if CSS letterboxes it, map clicks against the
    // rendered square, not the element box — otherwise placement drifts.
    const side = Math.min(rect.width, rect.height);
    const ox = (rect.width - side) / 2;
    const oy = (rect.height - side) / 2;
    return {
      x: Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left - ox) / side) * 100))),
      y: Math.round(Math.min(100, Math.max(0, ((e.clientY - rect.top - oy) / side) * 100))),
    };
  }

  function nearest(p: Point): { list: keyof DrillDiagram; index: number } | null {
    let best: { list: keyof DrillDiagram; index: number; d: number } | null = null;
    for (const list of ["attackers", "defenders", "balls", "cones"] as const) {
      (diagram[list] as Point[]).forEach((q, index) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < 6 && (!best || d < best.d)) best = { list, index, d };
      });
    }
    return best;
  }

  function click(e: React.MouseEvent) {
    const p = coords(e);
    setDiagram((d) => {
      const next = structuredClone(d);
      if (tool === "attacker") next.attackers.push(p);
      else if (tool === "defender") next.defenders.push(p);
      else if (tool === "ball") next.balls.push(p);
      else if (tool === "cone") next.cones.push(p);
      else if (tool === "erase") {
        const hit = nearest(p);
        if (hit) (next[hit.list] as Point[]).splice(hit.index, 1);
        else next.movements = next.movements.filter((m) => Math.hypot((m.from.x + m.to.x) / 2 - p.x, (m.from.y + m.to.y) / 2 - p.y) > 8);
      } else {
        // movement tools: first tap = start, second tap = end
        if (!pending) {
          setPending(p);
          return d;
        }
        const mv: Movement = { from: pending, to: p, kind: tool as Movement["kind"] };
        next.movements.push(mv);
        setPending(null);
      }
      return next;
    });
  }

  const count = diagram.attackers.length + diagram.defenders.length + diagram.movements.length;

  return (
    <div className="fade-in">
      <div className="board-toolbar no-print">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool ${tool === t.id ? "active" : ""}`} onClick={() => { setTool(t.id); setPending(null); }}>
            {t.label}
          </button>
        ))}
        <button className="tool" onClick={() => { setDiagram(structuredClone(EMPTY)); setPending(null); }}>🗑️ Clear</button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Tap the field to place {tool === "pass" || tool === "run" || tool === "dribble" ? `the ${tool}'s START, then its END — it animates instantly` : tool === "erase" ? "— tap items to remove them" : `a ${tool}`}.
        {pending && <b style={{ color: "var(--accent)" }}> Now tap the end point…</b>}
      </p>
      <div ref={svgWrap} onClick={click} style={{ cursor: "crosshair", maxWidth: 760 }}>
        <PitchDiagram diagram={diagram} />
      </div>
      {count === 0 && (
        <p className="muted small" style={{ marginTop: 10 }}>
          💡 Build the picture you want your players to see: place attackers and defenders, then draw passes and runs — the board
          animates the sequence on a loop. Perfect for explaining a pressing trap or a build-up pattern at practice.
        </p>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import type { Piece } from "../formations";

// The interactive pitch: players glide between scenarios (CSS transform
// transitions), ghost trails + arrows show what moved, and every piece is
// draggable — pointer coords map back into the 100x100 tactical grid.
// Opposition markers are a second draggable layer (red) so the coach can
// lay out exactly what they're facing; double-tap removes one.

interface Props {
  pieces: Piece[];
  ghosts?: Piece[] | null; // previous positions — drawn faint with arrows to current
  onMove?: (piece: Piece, from: { x: number; y: number }) => void;
  opponents?: Piece[];
  onMoveOpp?: (piece: Piece, from: { x: number; y: number }) => void;
  onRemoveOpp?: (id: string) => void;
  highlight?: string | null; // piece id being analyzed
}

const ROLE_COLOR: Record<string, string> = {
  GK: "#e8b64c", CB: "#7ea8ff", FB: "#7ea8ff", DM: "#2dd4bf", CM: "#2dd4bf", AM: "#c084fc", W: "#ff7a1a", ST: "#ff7a1a",
};

export function TacticsBoard({ pieces, ghosts, onMove, opponents, onMoveOpp, onRemoveOpp, highlight }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; side: "own" | "opp"; fromX: number; fromY: number } | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  function toGrid(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.min(97, Math.max(3, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(97, Math.max(3, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function down(e: React.PointerEvent, p: Piece, side: "own" | "opp") {
    if (side === "own" ? !onMove : !onMoveOpp) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ id: p.id, side, fromX: p.x, fromY: p.y });
    setLive({ id: p.id, x: p.x, y: p.y });
  }

  function move(e: React.PointerEvent) {
    if (!drag) return;
    const g = toGrid(e);
    setLive({ id: drag.id, ...g });
  }

  function up() {
    if (!drag || !live) return;
    const moved = Math.hypot(live.x - drag.fromX, live.y - drag.fromY);
    const list = drag.side === "own" ? pieces : opponents ?? [];
    const piece = list.find((p) => p.id === drag.id);
    if (piece && moved > 3) {
      const handler = drag.side === "own" ? onMove : onMoveOpp;
      handler?.({ ...piece, x: live.x, y: live.y }, { x: drag.fromX, y: drag.fromY });
    }
    setDrag(null);
    setLive(null);
  }

  const pos = (p: Piece) => (live && live.id === p.id ? { x: live.x, y: live.y } : { x: p.x, y: p.y });

  return (
    <svg
      ref={svgRef}
      className="tactics-board"
      viewBox="0 0 100 100"
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      role="application"
      aria-label="Interactive tactics board — drag players to explore shapes"
    >
      {/* pitch */}
      <rect x="0" y="0" width="100" height="100" rx="2" fill="#0d2818" />
      <rect x="1.2" y="1.2" width="97.6" height="97.6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
      <line x1="1.2" y1="50" x2="98.8" y2="50" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
      <rect x="30" y="1.2" width="40" height="12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
      <rect x="30" y="86.8" width="40" height="12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
      <rect x="41" y="1.2" width="18" height="5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.35" />
      <rect x="41" y="93.8" width="18" height="5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.35" />
      <text x="50" y="7" textAnchor="middle" fontSize="2.6" fill="rgba(255,255,255,0.4)">THEIR GOAL ▲</text>

      {/* ghost trail + movement arrows from previous scenario */}
      {ghosts?.map((g) => {
        const cur = pieces.find((p) => p.id === g.id);
        if (!cur || Math.hypot(cur.x - g.x, cur.y - g.y) < 3) return null;
        return (
          <g key={`ghost-${g.id}`}>
            <circle cx={g.x} cy={g.y} r="2.6" fill="rgba(255,255,255,0.12)" />
            <line
              x1={g.x} y1={g.y} x2={cur.x} y2={cur.y}
              stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" strokeDasharray="1.6 1.4"
              markerEnd="url(#tb-arrow)"
            />
          </g>
        );
      })}
      <defs>
        <marker id="tb-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="rgba(255,255,255,0.55)" />
        </marker>
      </defs>

      {/* opposition markers — the red layer the engine reads matchups against */}
      {opponents?.map((p) => {
        const { x, y } = pos(p);
        const dragging = drag?.id === p.id;
        return (
          <g
            key={p.id}
            transform={`translate(${x}, ${y})`}
            style={{ transition: dragging ? "none" : "transform 0.35s ease", cursor: onMoveOpp ? "grab" : "default" }}
            onPointerDown={(e) => down(e, p, "opp")}
            onDoubleClick={() => onRemoveOpp?.(p.id)}
          >
            <title>Opposition {p.label} — drag to position, double-tap to remove</title>
            <circle r="3.2" fill="#e5484d" stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" opacity={dragging ? 0.85 : 0.95} />
            <text y="1" textAnchor="middle" fontSize="2.2" fontWeight="800" fill="#fff" style={{ pointerEvents: "none", userSelect: "none" }}>
              {p.label}
            </text>
          </g>
        );
      })}

      {/* players */}
      {pieces.map((p) => {
        const { x, y } = pos(p);
        const dragging = drag?.id === p.id;
        const hot = highlight === p.id;
        return (
          <g
            key={p.id}
            transform={`translate(${x}, ${y})`}
            style={{ transition: dragging ? "none" : "transform 0.7s cubic-bezier(.3,1.2,.4,1)", cursor: onMove ? "grab" : "default" }}
            onPointerDown={(e) => down(e, p, "own")}
          >
            {hot && <circle r="5.4" fill="none" stroke="#ff7a1a" strokeWidth="0.6" opacity="0.8"><animate attributeName="r" values="4.6;6;4.6" dur="1.6s" repeatCount="indefinite" /></circle>}
            <circle r="3.4" fill={ROLE_COLOR[p.role] ?? "#fff"} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" opacity={dragging ? 0.85 : 1} />
            <text y="1.1" textAnchor="middle" fontSize="2.4" fontWeight="800" fill="#10131f" style={{ pointerEvents: "none", userSelect: "none" }}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

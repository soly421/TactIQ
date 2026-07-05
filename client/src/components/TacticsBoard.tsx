import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { MatchupCallout, Piece } from "../formations";

// The interactive pitch — now a realistic LANDSCAPE field: mowing stripes,
// full markings, and clean red (us) / blue (them) jersey kits. The engine's
// coordinate system is unchanged (100x100 grid, y=0 = opponent goal); a
// projection layer maps that grid onto the landscape so we attack left→right
// on screen while every geometry fact, doctrine check and ball route the
// engine computed stays exactly as validated. Players glide between paints,
// ghosts show what moved, callouts and the ball route draw on top, and every
// kit is draggable (pointer coords are un-projected back into the grid).

interface Props {
  pieces: Piece[];
  ghosts?: Piece[] | null;
  onMove?: (piece: Piece, from: { x: number; y: number }) => void;
  opponents?: Piece[];
  onMoveOpp?: (piece: Piece, from: { x: number; y: number }) => void;
  onRemoveOpp?: (id: string) => void;
  highlight?: string | null;
  ball?: { x: number; y: number } | null;
  callouts?: MatchupCallout[];
  suggestedPath?: { x: number; y: number }[];
}

export interface TacticsBoardHandle {
  svg: () => SVGSVGElement | null;
}

const CALLOUT_COLOR: Record<MatchupCallout["kind"], string> = {
  press: "#ffd166", // gold — the job
  free: "#2dd47a", // green — the opportunity
  exploit: "#4cc9f0", // cyan — the space
  danger: "#ff5d5d", // red — the warning
};

// Landscape viewBox and the play area inside it (a ~1.5:1 pitch).
const VBW = 152;
const VBH = 100;
const PX0 = 4, PY0 = 4, PW = VBW - 2 * PX0, PH = VBH - 2 * PY0;

// grid (x: 0 left touchline→100 right; y: 0 THEIR goal→100 OUR goal)
// → screen: we attack left→right, so OUR goal is on the left, theirs right.
const projX = (gy: number) => PX0 + ((100 - gy) / 100) * PW;
const projY = (gx: number) => PY0 + (gx / 100) * PH;

const KIT_R = 3.5; // fixed screen radius so kits stay round despite x/y scale

export const TacticsBoard = forwardRef<TacticsBoardHandle, Props>(function TacticsBoard(
  { pieces, ghosts, onMove, opponents, onMoveOpp, onRemoveOpp, highlight, ball, callouts, suggestedPath },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; side: "own" | "opp"; fromX: number; fromY: number } | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  useImperativeHandle(ref, () => ({ svg: () => svgRef.current }), []);

  // pointer (client px) → grid, accounting for preserveAspectRatio letterboxing
  function toGrid(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const s = Math.min(rect.width / VBW, rect.height / VBH);
    const offX = (rect.width - VBW * s) / 2;
    const offY = (rect.height - VBH * s) / 2;
    const vx = (e.clientX - rect.left - offX) / s;
    const vy = (e.clientY - rect.top - offY) / s;
    const gy = 100 - ((vx - PX0) / PW) * 100;
    const gx = ((vy - PY0) / PH) * 100;
    return { x: Math.min(97, Math.max(3, gx)), y: Math.min(97, Math.max(3, gy)) };
  }

  function down(e: React.PointerEvent, p: Piece, side: "own" | "opp") {
    if (side === "own" ? !onMove : !onMoveOpp) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ id: p.id, side, fromX: p.x, fromY: p.y });
    setLive({ id: p.id, x: p.x, y: p.y });
  }

  function move(e: React.PointerEvent) {
    if (!drag) return;
    setLive({ id: drag.id, ...toGrid(e) });
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

  const gpos = (p: Piece) => (live && live.id === p.id ? { x: live.x, y: live.y } : { x: p.x, y: p.y });
  const sp = (p: Piece) => { const g = gpos(p); return { x: projX(g.y), y: projY(g.x) }; };

  // vertical mowing stripes
  const STRIPES = 9;
  const stripeW = PW / STRIPES;

  return (
    <svg
      ref={svgRef}
      className="tactics-board"
      viewBox={`0 0 ${VBW} ${VBH}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      role="application"
      aria-label="Interactive tactics board — drag players to explore shapes"
    >
      <defs>
        <marker id="tb-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="rgba(255,255,255,0.6)" />
        </marker>
        <marker id="tb-ball-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5.5" markerHeight="5.5" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#4cc9f0" />
        </marker>
        <filter id="tb-kit-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.5" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* turf + mowing stripes */}
      <rect x="0" y="0" width={VBW} height={VBH} rx="2.5" fill="#1f6b39" />
      {Array.from({ length: STRIPES }).map((_, i) => (
        <rect key={i} x={PX0 + i * stripeW} y={PY0} width={stripeW} height={PH}
          fill={i % 2 === 0 ? "#2c854a" : "#268044"} />
      ))}

      {/* markings */}
      <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.35">
        <rect x={PX0} y={PY0} width={PW} height={PH} rx="0.6" />
        <line x1={projX(50)} y1={PY0} x2={projX(50)} y2={PY0 + PH} />
        <circle cx={projX(50)} cy={PY0 + PH / 2} r="11.5" />
        {/* their goal (right) */}
        <rect x={PW + PX0 - 22} y={PY0 + PH / 2 - 24} width="22" height="48" />
        <rect x={PW + PX0 - 8} y={PY0 + PH / 2 - 12} width="8" height="24" />
        <path d={`M ${PW + PX0 - 22} ${PY0 + PH / 2 - 9} A 11 11 0 0 0 ${PW + PX0 - 22} ${PY0 + PH / 2 + 9}`} />
        {/* our goal (left) */}
        <rect x={PX0} y={PY0 + PH / 2 - 24} width="22" height="48" />
        <rect x={PX0} y={PY0 + PH / 2 - 12} width="8" height="24" />
        <path d={`M ${PX0 + 22} ${PY0 + PH / 2 - 9} A 11 11 0 0 1 ${PX0 + 22} ${PY0 + PH / 2 + 9}`} />
      </g>
      <g fill="rgba(255,255,255,0.85)">
        <circle cx={projX(50)} cy={PY0 + PH / 2} r="0.7" />
        <circle cx={PW + PX0 - 15} cy={PY0 + PH / 2} r="0.7" />
        <circle cx={PX0 + 15} cy={PY0 + PH / 2} r="0.7" />
      </g>
      {/* goal frames */}
      <rect x={PW + PX0} y={PY0 + PH / 2 - 6} width="2.4" height="12" fill="rgba(255,255,255,0.9)" />
      <rect x={PX0 - 2.4} y={PY0 + PH / 2 - 6} width="2.4" height="12" fill="rgba(255,255,255,0.9)" />
      <text x={PW + PX0 - 2} y={PY0 + 4.5} textAnchor="end" fontSize="2.5" fill="rgba(255,255,255,0.55)" fontWeight="700">THEIR GOAL ▶</text>
      <text x={PX0 + 2} y={PY0 + 4.5} textAnchor="start" fontSize="2.5" fill="rgba(255,255,255,0.55)" fontWeight="700">◀ OUR GOAL</text>

      {/* ghost trail + movement arrows from the previous paint */}
      {ghosts?.map((g) => {
        const cur = pieces.find((p) => p.id === g.id);
        if (!cur || Math.hypot(cur.x - g.x, cur.y - g.y) < 3) return null;
        const a = { x: projX(g.y), y: projY(g.x) };
        const b = { x: projX(cur.y), y: projY(cur.x) };
        return (
          <g key={`ghost-${g.id}`}>
            <circle cx={a.x} cy={a.y} r="2.6" fill="rgba(255,255,255,0.14)" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" strokeDasharray="1.6 1.4" markerEnd="url(#tb-arrow)" />
          </g>
        );
      })}

      {/* opposition kits (blue) — the layer the engine reads matchups against */}
      {opponents?.map((p) => {
        const { x, y } = sp(p);
        const dragging = drag?.id === p.id;
        return (
          <g key={p.id} transform={`translate(${x}, ${y})`}
            style={{ transition: dragging ? "none" : "transform 0.35s ease", cursor: onMoveOpp ? "grab" : "default" }}
            onPointerDown={(e) => down(e, p, "opp")}
            onDoubleClick={() => onRemoveOpp?.(p.id)}>
            <title>Opposition {p.label} — drag to position, double-tap to remove</title>
            <circle r={KIT_R} fill="#3b82f6" stroke="#dbe9ff" strokeWidth="0.5" opacity={dragging ? 0.85 : 0.97} filter="url(#tb-kit-shadow)" />
            <text y="1" textAnchor="middle" fontSize="2.2" fontWeight="800" fill="#fff" style={{ pointerEvents: "none", userSelect: "none" }}>{p.label}</text>
          </g>
        );
      })}

      {/* our kits (red) */}
      {pieces.map((p) => {
        const { x, y } = sp(p);
        const dragging = drag?.id === p.id;
        const hot = highlight === p.id;
        const isGK = p.role === "GK";
        return (
          <g key={p.id} transform={`translate(${x}, ${y})`}
            style={{ transition: dragging ? "none" : "transform 0.7s cubic-bezier(.3,1.2,.4,1)", cursor: onMove ? "grab" : "default" }}
            onPointerDown={(e) => down(e, p, "own")}>
            <title>{p.label}{isGK ? " (goalkeeper)" : ""}</title>
            {hot && <circle r="5.6" fill="none" stroke="#ffd166" strokeWidth="0.6" opacity="0.85"><animate attributeName="r" values="4.8;6.2;4.8" dur="1.6s" repeatCount="indefinite" /></circle>}
            <circle r={KIT_R} fill={isGK ? "#f5c542" : "#e5484d"} stroke={isGK ? "#3a2a00" : "#ffe0e0"} strokeWidth="0.5" opacity={dragging ? 0.85 : 1} filter="url(#tb-kit-shadow)" />
            <text y="1.05" textAnchor="middle" fontSize="2.3" fontWeight="800" fill={isGK ? "#241a00" : "#fff"} style={{ pointerEvents: "none", userSelect: "none" }}>{p.label}</text>
          </g>
        );
      })}

      {/* recommended ball route — marching dashes */}
      {suggestedPath && suggestedPath.length >= 2 && (
        <g style={{ pointerEvents: "none" }}>
          {suggestedPath.slice(1).map((wp, i) => {
            const a = suggestedPath[i];
            const A = { x: projX(a.y), y: projY(a.x) };
            const B = { x: projX(wp.y), y: projY(wp.x) };
            return (
              <line key={`sp-${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#4cc9f0" strokeWidth="0.7" strokeDasharray="2.2 1.7" opacity="0.95" markerEnd="url(#tb-ball-arrow)">
                <animate attributeName="stroke-dashoffset" from="0" to="-7.8" dur="1.1s" repeatCount="indefinite" />
              </line>
            );
          })}
          <circle cx={projX(suggestedPath[0].y)} cy={projY(suggestedPath[0].x)} r="1.4" fill="#4cc9f0" opacity="0.95" />
        </g>
      )}

      {/* matchup callouts — numbered instructions anchored on the pitch */}
      {callouts?.map((c) => {
        const color = CALLOUT_COLOR[c.kind];
        const at = { x: projX(c.y), y: projY(c.x) };
        const badge = { x: Math.min(VBW - 8, Math.max(8, at.x)), y: at.y < 12 ? at.y + 7.2 : at.y - 6.4 };
        return (
          <g key={`co-${c.n}`} style={{ pointerEvents: "none" }}>
            {c.from && (() => { const f = { x: projX(c.from.y), y: projY(c.from.x) }; return (
              <line x1={f.x} y1={f.y} x2={at.x} y2={at.y} stroke={color} strokeWidth="0.55" strokeDasharray="1.4 1.2" opacity="0.85" markerEnd="url(#tb-arrow)" />
            ); })()}
            <circle cx={at.x} cy={at.y} r="4.8" fill="none" stroke={color} strokeWidth="0.55" opacity="0.85">
              <animate attributeName="r" values="4;5.6;4" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <g transform={`translate(${badge.x}, ${badge.y})`}>
              <circle r="2.5" fill={color} stroke="rgba(0,0,0,0.55)" strokeWidth="0.4" />
              <text y="1" textAnchor="middle" fontSize="2.6" fontWeight="900" fill="#10131f">{c.n}</text>
            </g>
            <title>{c.text}</title>
          </g>
        );
      })}

      {/* the ball — on top of everyone */}
      {ball && (
        <g transform={`translate(${projX(ball.y)}, ${projY(ball.x)})`} style={{ transition: "transform 0.75s ease-in-out", pointerEvents: "none" }}>
          <circle r="1.8" fill="#fff" stroke="#0d2818" strokeWidth="0.4" />
          <circle r="0.75" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="0.3" />
        </g>
      )}
    </svg>
  );
});

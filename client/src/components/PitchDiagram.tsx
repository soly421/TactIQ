import type { DrillDiagram, Point } from "../types";

// Renders a drill on a 100x100 grid with animated movement arrows.
export function PitchDiagram({ diagram }: { diagram: DrillDiagram }) {
  const clamp = (p: Point) => ({ x: Math.min(97, Math.max(3, p.x)), y: Math.min(97, Math.max(3, p.y)) });

  return (
    <svg viewBox="0 0 100 100" className="pitch-svg" style={{ background: "#0f4d27", aspectRatio: "1.3/1" }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />
        </marker>
      </defs>
      {/* field texture stripes */}
      {[0, 20, 40, 60, 80].map((y) => (
        <rect key={y} x="0" y={y} width="100" height="10" fill="#115a2e" />
      ))}
      <rect x="1.5" y="1.5" width="97" height="97" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />

      {/* goals */}
      {diagram.goals?.map((g, i) => {
        const p = clamp(g);
        const horizontal = p.y < 15 || p.y > 85;
        return horizontal ? (
          <rect key={`g${i}`} x={p.x - 6} y={p.y < 50 ? 0.5 : 96.5} width="12" height="3" fill="none" stroke="#fff" strokeWidth="0.9" />
        ) : (
          <rect key={`g${i}`} x={p.x < 50 ? 0.5 : 96.5} y={p.y - 6} width="3" height="12" fill="none" stroke="#fff" strokeWidth="0.9" />
        );
      })}

      {/* movement arrows */}
      {diagram.movements?.map((m, i) => {
        const f = clamp(m.from);
        const t = clamp(m.to);
        const color = m.kind === "pass" ? "#ffe14d" : m.kind === "dribble" ? "#7ef0ff" : "#ffffff";
        return (
          <line
            key={`m${i}`}
            className="mv-line"
            x1={f.x} y1={f.y} x2={t.x} y2={t.y}
            stroke={color} strokeWidth="0.8" markerEnd="url(#arrow)" opacity="0.95"
          />
        );
      })}

      {/* cones */}
      {diagram.cones?.map((c, i) => {
        const p = clamp(c);
        return <path key={`c${i}`} d={`M ${p.x} ${p.y - 1.7} L ${p.x + 1.5} ${p.y + 1.2} L ${p.x - 1.5} ${p.y + 1.2} Z`} fill="#ff6a00" />;
      })}

      {/* players */}
      {diagram.attackers?.map((a, i) => {
        const p = clamp(a);
        return (
          <g key={`a${i}`} className="player-dot" style={{ animationDelay: `${i * 60}ms` }}>
            <circle cx={p.x} cy={p.y} r="2.6" fill="#ff6a00" stroke="#fff" strokeWidth="0.5" />
            <text x={p.x} y={p.y + 1} fontSize="2.6" fill="#fff" textAnchor="middle" fontWeight="bold">{i + 1}</text>
          </g>
        );
      })}
      {diagram.defenders?.map((d, i) => {
        const p = clamp(d);
        return (
          <g key={`d${i}`} className="player-dot" style={{ animationDelay: `${i * 60 + 150}ms` }}>
            <circle cx={p.x} cy={p.y} r="2.6" fill="#2f6fed" stroke="#fff" strokeWidth="0.5" />
            <text x={p.x} y={p.y + 1} fontSize="2.6" fill="#fff" textAnchor="middle" fontWeight="bold">{i + 1}</text>
          </g>
        );
      })}
      {diagram.neutrals?.map((n, i) => {
        const p = clamp(n);
        return <circle key={`n${i}`} className="player-dot" cx={p.x} cy={p.y} r="2.3" fill="#ffd65a" stroke="#fff" strokeWidth="0.5" />;
      })}

      {/* balls */}
      {diagram.balls?.map((b, i) => {
        const p = clamp(b);
        return <circle key={`b${i}`} className="ball-dot" cx={p.x} cy={p.y} r="1.6" fill="#fff" stroke="#111" strokeWidth="0.4" />;
      })}
    </svg>
  );
}

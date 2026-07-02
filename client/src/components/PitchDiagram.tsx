import { useState } from "react";
import type { DrillDiagram, Point } from "../types";

// Animated drill renderer: movements play as a looping, sequenced animation —
// the ball travels pass lines, players travel run/dribble lines.
export function PitchDiagram({ diagram }: { diagram: DrillDiagram }) {
  const [playing, setPlaying] = useState(true);
  const clamp = (p: Point) => ({ x: Math.min(97, Math.max(3, p.x)), y: Math.min(97, Math.max(3, p.y)) });

  const movements = diagram.movements ?? [];
  const STEP = 1.6; // seconds per movement
  const cycle = Math.max(movements.length, 1) * STEP + 0.8;

  // SMIL keyTimes: each movement's marker is parked at start, travels during its
  // window in the shared cycle, then hides until the loop restarts.
  function animFor(i: number, from: Point, to: Point) {
    const t0 = (i * STEP) / cycle;
    const t1 = (i * STEP + STEP * 0.85) / cycle;
    const keyTimes = `0;${t0.toFixed(4)};${t1.toFixed(4)};1`;
    return {
      cx: `${from.x};${from.x};${to.x};${to.x}`,
      cy: `${from.y};${from.y};${to.y};${to.y}`,
      opacity: `0;1;1;0`,
      keyTimes,
    };
  }

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox="0 0 100 100" className="pitch-svg" style={{ background: "#0f4d27", aspectRatio: "1.3/1" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff" />
          </marker>
        </defs>
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

        {/* movement paths */}
        {movements.map((m, i) => {
          const f = clamp(m.from);
          const t = clamp(m.to);
          const color = m.kind === "pass" ? "#ffe14d" : m.kind === "dribble" ? "#7ef0ff" : "#ffffff";
          return (
            <line
              key={`m${i}`}
              className="mv-line"
              x1={f.x} y1={f.y} x2={t.x} y2={t.y}
              stroke={color} strokeWidth="0.8" markerEnd="url(#arrow)" opacity="0.85"
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

        {/* static balls (hidden while animation is playing and there are pass movements) */}
        {(!playing || !movements.some((m) => m.kind === "pass")) &&
          diagram.balls?.map((b, i) => {
            const p = clamp(b);
            return <circle key={`b${i}`} className="ball-dot" cx={p.x} cy={p.y} r="1.6" fill="#fff" stroke="#111" strokeWidth="0.4" />;
          })}

        {/* animated actors: ball travels passes, ghost players travel runs/dribbles */}
        {playing &&
          movements.map((m, i) => {
            const f = clamp(m.from);
            const t = clamp(m.to);
            const a = animFor(i, f, t);
            if (m.kind === "pass") {
              return (
                <circle key={`anim${i}`} r="1.7" fill="#fff" stroke="#111" strokeWidth="0.4" opacity="0">
                  <animate attributeName="cx" values={a.cx} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={a.cy} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values={a.opacity} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                </circle>
              );
            }
            const fill = m.kind === "dribble" ? "#7ef0ff" : "rgba(255,255,255,0.9)";
            return (
              <g key={`anim${i}`}>
                <circle r="2.2" fill={fill} stroke="#fff" strokeWidth="0.4" opacity="0">
                  <animate attributeName="cx" values={a.cx} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={a.cy} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values={a.opacity} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                </circle>
                {m.kind === "dribble" && (
                  <circle r="1.1" fill="#fff" stroke="#111" strokeWidth="0.3" opacity="0">
                    <animate attributeName="cx" values={a.cx} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                    <animate attributeName="cy" values={a.cy} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" values={a.opacity} keyTimes={a.keyTimes} dur={`${cycle}s`} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
      </svg>

      {movements.length > 0 && (
        <button className="anim-toggle no-print" onClick={() => setPlaying((p) => !p)} title={playing ? "Pause animation" : "Play animation"}>
          {playing ? "⏸" : "▶"}
        </button>
      )}
      <div className="diagram-legend no-print">
        <span><i style={{ background: "#ff6a00" }} /> attack</span>
        <span><i style={{ background: "#2f6fed" }} /> defend</span>
        <span><i style={{ background: "#ffe14d" }} /> pass</span>
        <span><i style={{ background: "#7ef0ff" }} /> dribble</span>
        <span><i style={{ background: "#fff" }} /> run</span>
      </div>
    </div>
  );
}

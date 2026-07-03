import { useMemo, useState } from "react";
import type { FormationPosition } from "../types";

// AI positions carry no spacing guarantee — separate any that stack so a
// live engine output can never draw two labeled dots on the same spot.
function spreadPositions(positions: FormationPosition[]): FormationPosition[] {
  const ps = positions.map((p) => ({ ...p }));
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[j].x - ps[i].x, dy = ps[j].y - ps[i].y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          const ux = d < 0.01 ? 1 : dx / d, uy = d < 0.01 ? 0 : dy / d;
          const push = (6 - d) / 2 + 0.3;
          ps[i].x -= ux * push; ps[i].y -= uy * push;
          ps[j].x += ux * push; ps[j].y += uy * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return ps;
}

// Full-pitch vertical view (attacking toward the top). Click a position for details.
export function FormationPitch({ positions: raw }: { positions: FormationPosition[] }) {
  const positions = useMemo(() => spreadPositions(raw), [raw]);
  const [selected, setSelected] = useState<FormationPosition | null>(null);

  return (
    <div>
      <svg viewBox="0 0 100 130" className="pitch-svg" style={{ background: "#0f4d27", maxHeight: 560 }}>
        {[0, 26, 52, 78, 104].map((y) => (
          <rect key={y} x="0" y={y} width="100" height="13" fill="#115a2e" />
        ))}
        <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
        <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
        <circle cx="50" cy="65" r="9" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
        {/* penalty boxes */}
        <rect x="28" y="2" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
        <rect x="28" y="114" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.6" />
        <rect x="40" y="0.5" width="20" height="2.5" fill="none" stroke="#fff" strokeWidth="0.7" />
        <rect x="40" y="127" width="20" height="2.5" fill="none" stroke="#fff" strokeWidth="0.7" />

        {positions.map((pos, i) => {
          const x = Math.min(94, Math.max(6, pos.x));
          const y = Math.min(124, Math.max(6, (pos.y / 100) * 126 + 2));
          const active = selected === pos;
          return (
            <g
              key={i}
              className="player-dot"
              style={{ animationDelay: `${i * 70}ms`, cursor: "pointer" }}
              onClick={() => setSelected(active ? null : pos)}
            >
              <circle cx={x} cy={y} r={active ? 4.6 : 4} fill={active ? "#ffb35c" : "#ff6a00"} stroke="#fff" strokeWidth="0.7" />
              <text x={x} y={y + 1.3} fontSize="3.2" fill="#fff" textAnchor="middle" fontWeight="bold">
                {pos.label}
              </text>
              {pos.suggestedPlayer && (
                <text x={x} y={y + 7} fontSize="2.6" fill="#ffe14d" textAnchor="middle" fontWeight="bold">
                  {pos.suggestedPlayer.split(" ")[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selected && (
        <div className="card fade-in" style={{ marginTop: 12 }}>
          <h3>
            {selected.label} — <span style={{ color: "var(--accent)" }}>{selected.role}</span>
            {selected.suggestedPlayer && <span className="muted"> · {selected.suggestedPlayer}</span>}
          </h3>
          <ul className="points">
            {selected.keyInstructions.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </div>
      )}
      {!selected && <p className="muted small" style={{ marginTop: 10 }}>Tap any position to see its role and key instructions.</p>}
    </div>
  );
}

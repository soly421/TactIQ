// Robinhood-style portfolio line chart of XP over time.
export function XpChart({ history, height = 180 }: { history: { t: string; xp: number }[]; height?: number }) {
  const W = 800;
  const H = 240;
  const points = history.length >= 2 ? history : [{ t: "", xp: 0 }, ...history, { t: "", xp: history.at(-1)?.xp ?? 0 }];
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const maxXp = Math.max(...points.map((p) => p.xp), 10);
  const minXp = Math.min(...points.map((p) => p.xp));
  const span = maxXp - minXp || 1;
  const ys = points.map((p) => H - 20 - ((p.xp - minXp) / span) * (H - 50));

  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2;
    d += ` C ${cx} ${ys[i - 1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`;
  }
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="xpfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,106,0,0.35)" />
          <stop offset="100%" stopColor="rgba(255,106,0,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#xpfill)" />
      <path d={d} fill="none" stroke="#ff6a00" strokeWidth="3" strokeLinecap="round" className="chart-line" />
      <circle cx={xs.at(-1)} cy={ys.at(-1)} r="5" fill="#ff6a00" className="chart-tip" />
    </svg>
  );
}

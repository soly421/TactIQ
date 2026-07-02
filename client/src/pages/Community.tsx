import { XpBar, useGamify } from "../components/Gamify";

export function Community() {
  const { progress } = useGamify();
  if (!progress) return null;

  return (
    <div className="fade-in">
      <h1>Community</h1>
      <p className="sub">Climb the coaching ranks. Earn XP for every session, brainstorm, and analysis — streaks multiply your momentum.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Your Rank</h2>
        <XpBar />
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>🏆 Leaderboard</h2>
          {progress.leaderboard.map((row) => (
            <div key={row.rank} className={`leader-row ${row.you ? "you" : ""}`}>
              <span className="rank">#{row.rank}</span>
              <span className="name">{row.name} {row.you && "⭐"}</span>
              <span className="xp">{row.xp.toLocaleString()} XP</span>
            </div>
          ))}
          <p className="muted small" style={{ marginTop: 10 }}>
            Community leaderboards go live with accounts — these coaches are your pace-setters for now.
          </p>
        </div>

        <div className="card">
          <h2>🎖️ Badges</h2>
          <div className="grid cols-4" style={{ gap: 10 }}>
            {progress.badges.map((b) => (
              <div key={b.id} className={`card badge-tile ${b.earned ? "earned" : ""}`} title={b.description}>
                <div className="icon">{b.emoji}</div>
                <div className="name">{b.name}</div>
                <div className="desc">{b.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

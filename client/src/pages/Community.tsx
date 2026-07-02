import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { XpBar, useGamify } from "../components/Gamify";

// The competition tab. Three loops, borrowed from the apps that mastered them:
// the weekly league (Duolingo — always winnable, resets Monday), the Club Cup
// (Strava clubs — peer pressure), and the trophy case (everything collectible).

interface CommunityData {
  league: {
    tier: number;
    name: string;
    emoji: string;
    resetsAt: string;
    promoteCount: number;
    demoteCount: number;
    standings: { rank: number; name: string; weeklyXp: number; streak: number; you: boolean; zone: "promote" | "safe" | "demote" }[];
  };
  clubCup: { rank: number; club: string; weeklyXp: number; coaches: number; yours: boolean }[];
  recap: { weeklyXp: number; weeklyRank: number; sessions: number; matchdays: number; chats: number; ratings: number };
  streak: { current: number; freezeAvailable: boolean };
}

function countdownTo(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

const LEAGUE_LADDER = [
  "🌱 Grassroots",
  "🥉 D License",
  "🥈 C License",
  "🥇 B License",
  "🏅 A License",
  "💼 Pro License",
  "👑 Legends",
];

export function Community() {
  const { progress } = useGamify();
  const [data, setData] = useState<CommunityData | null>(null);

  useEffect(() => {
    void getJSON<CommunityData>("/api/community").then(setData).catch(() => {});
  }, [progress?.xp]);

  if (!progress) return null;
  const earned = progress.badges.filter((b) => b.earned).length;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1>Community</h1>
        {data && (
          <span className="chip" title="Your weekly league resets Monday 00:00 UTC">
            ⏳ League resets in <b>{countdownTo(data.league.resetsAt)}</b>
          </span>
        )}
      </div>
      <p className="sub">
        Every week is a fresh race: XP earned <b>this week</b> decides who climbs to the next license. Finish in the green zone to
        promote — drop to the red and you're back down.
      </p>

      {data && (
        <div className="grid cols-2" style={{ alignItems: "start", marginBottom: 16 }}>
          <div className="card league-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{data.league.emoji} {data.league.name}</h2>
              <span className="muted small">top {data.league.promoteCount || "—"} promote · bottom {data.league.demoteCount || "—"} drop</span>
            </div>
            <div className="league-ladder">
              {LEAGUE_LADDER.map((l, i) => (
                <span key={l} className={`ladder-step ${i === data.league.tier ? "here" : ""} ${i < data.league.tier ? "below" : ""}`} title={l}>
                  {l.split(" ")[0]}
                </span>
              ))}
            </div>
            {data.league.standings.length <= 1 ? (
              <p className="muted small" style={{ marginTop: 10 }}>
                You're first into this league — every session, chat, and match day this week banks XP toward promotion. Invite your
                fellow coaches with the club code and make it a race.
              </p>
            ) : (
              data.league.standings.map((s) => (
                <div key={s.rank} className={`leader-row zone-${s.zone} ${s.you ? "you" : ""}`}>
                  <span className="rank">{s.zone === "promote" ? "▲" : s.zone === "demote" ? "▼" : ""} #{s.rank}</span>
                  <span className="name">{s.name} {s.you && "⭐"} {s.streak >= 3 && <span title={`${s.streak}-day streak`}>🔥</span>}</span>
                  <span className="xp">{s.weeklyXp.toLocaleString()} XP</span>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>📋 Your week</h2>
              <div className="vitals-row">
                <div><div className="v-num" style={{ color: "var(--accent)" }}>{data.recap.weeklyXp.toLocaleString()}</div><div className="muted small">XP this week</div></div>
                <div><div className="v-num">#{data.recap.weeklyRank}</div><div className="muted small">League rank</div></div>
                <div><div className="v-num">🔥 {data.streak.current}</div><div className="muted small">Streak</div></div>
              </div>
              <p className="small" style={{ margin: "10px 0 0", color: data.streak.freezeAvailable ? "var(--turquoise)" : "var(--muted)" }}>
                {data.streak.freezeAvailable
                  ? "🧊 Streak freeze ready — miss one day this week and your flame survives."
                  : "🧊 Streak freeze used this week — don't miss a day!"}
              </p>
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>🏆 The Club Cup</h2>
              <p className="muted small" style={{ marginTop: 0 }}>Clubs ranked by their coaches' combined XP this week.</p>
              {data.clubCup.length === 0 && (
                <p className="muted small">No clubs on the board yet — join or create one in the Club tab and put yours on the map.</p>
              )}
              {data.clubCup.map((c) => (
                <div key={c.rank} className={`leader-row ${c.yours ? "you" : ""}`}>
                  <span className="rank">{c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}</span>
                  <span className="name">{c.club} {c.yours && "⭐"} <span className="muted small">· {c.coaches} coach{c.coaches === 1 ? "" : "es"}</span></span>
                  <span className="xp">{c.weeklyXp.toLocaleString()} XP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Career Rank</h2>
        <XpBar />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>🎖️ Trophy Case</h2>
          <span className="muted small">{earned} of {progress.badges.length} earned</span>
        </div>
        <div className="grid cols-4" style={{ gap: 10 }}>
          {progress.badges.map((b) => (
            <div key={b.id} className={`card badge-tile ${b.earned ? "earned" : ""}`} title={b.description}>
              <div className="icon">{b.earned ? b.emoji : "🔒"}</div>
              <div className="name">{b.name}</div>
              <div className="desc">{b.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

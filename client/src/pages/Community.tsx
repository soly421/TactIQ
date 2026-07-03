import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { Club } from "./Club";
import { TouchlineDebate } from "../components/TouchlineDebate";
import { XpBar, useGamify } from "../components/Gamify";
import type { User } from "../types";

// The competition tab: the weekly license league, the Club Cup, the debate,
// and the trophy case — with the coach's club living one toggle away.
// Layout is deliberately dense: one stat strip up top, two tight columns,
// and filled empty-states so a young league never looks like a ghost town.

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

export function Community({ user }: { user: User }) {
  const { progress } = useGamify();
  const [view, setView] = useState<"global" | "club">("global");
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
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab ${view === "global" ? "active" : ""}`} onClick={() => setView("global")}>🌍 Community</button>
          <button className={`tab ${view === "club" ? "active" : ""}`} onClick={() => setView("club")}>
            🏛️ {user.club ? user.club.name : "My Club"}
          </button>
        </div>
      </div>

      {view === "club" && <Club user={user} />}

      {view === "global" && (
        <>
          <p className="sub" style={{ marginBottom: 12 }}>
            Every week is a fresh race: XP earned <b>this week</b> decides who climbs to the next license. Green zone promotes, red
            drops{data ? <> — resets in <b>{countdownTo(data.league.resetsAt)}</b></> : ""}.
          </p>

          {/* one dense strip: the week, the streak, the career — no lonely cards */}
          {data && (
            <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                <div><div className="v-num" style={{ color: "var(--accent)" }}>{data.recap.weeklyXp.toLocaleString()}</div><div className="muted small">XP this week</div></div>
                <div><div className="v-num">#{data.recap.weeklyRank}</div><div className="muted small">league rank</div></div>
                <div><div className="v-num">🔥 {data.streak.current}</div><div className="muted small">day streak</div></div>
                <div title={data.streak.freezeAvailable ? "Miss one day this week and your flame survives." : "Freeze used this week — don't miss a day!"}>
                  <div className="v-num">{data.streak.freezeAvailable ? "🧊" : "—"}</div>
                  <div className="muted small">freeze {data.streak.freezeAvailable ? "ready" : "used"}</div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <XpBar />
                </div>
              </div>
              <p className="muted small" style={{ margin: "8px 0 0" }}>
                Season so far: {data.recap.sessions} session{data.recap.sessions === 1 ? "" : "s"} · {data.recap.matchdays} match day{data.recap.matchdays === 1 ? "" : "s"} · {data.recap.chats} chat{data.recap.chats === 1 ? "" : "s"} · {data.recap.ratings} rating{data.recap.ratings === 1 ? "" : "s"}
              </p>
            </div>
          )}

          {data && (
            <div className="grid cols-2" style={{ alignItems: "start", marginBottom: 14 }}>
              <div>
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
                  {data.league.standings.map((s) => (
                    <div key={s.rank} className={`leader-row zone-${s.zone} ${s.you ? "you" : ""}`}>
                      <span className="rank">{s.zone === "promote" ? "▲" : s.zone === "demote" ? "▼" : ""} #{s.rank}</span>
                      <span className="name">{s.name} {s.you && "⭐"} {s.streak >= 3 && <span title={`${s.streak}-day streak`}>🔥</span>}</span>
                      <span className="xp">{s.weeklyXp.toLocaleString()} XP</span>
                    </div>
                  ))}
                  {/* a young league still looks like a board: open spots invite the race */}
                  {data.league.standings.length < 5 &&
                    Array.from({ length: 5 - data.league.standings.length }, (_, i) => (
                      <div key={`open-${i}`} className="leader-row" style={{ opacity: 0.45 }}>
                        <span className="rank">#{data.league.standings.length + i + 1}</span>
                        <span className="name muted">open spot — invite a coach</span>
                        <span className="xp muted">—</span>
                      </div>
                    ))}
                  {data.league.standings.length <= 1 && (
                    <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                      You're first into this league — every session, chat, and match day banks XP toward promotion.
                    </p>
                  )}
                </div>

              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <TouchlineDebate />
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h2 style={{ margin: 0 }}>🏆 The Club Cup</h2>
                    <span className="muted small">combined coach XP this week</span>
                  </div>
                  {data.clubCup.length === 0 && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      No clubs on the board yet — <button className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setView("club")}>join or create yours →</button>
                    </p>
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

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>🎖️ Trophy Case</h2>
              <span className="muted small">{earned} of {progress.badges.length} earned</span>
            </div>
            <div className="grid cols-4" style={{ gap: 10, marginTop: 10 }}>
              {progress.badges.map((b) => (
                <div key={b.id} className={`card badge-tile ${b.earned ? "earned" : ""}`} title={b.description}>
                  <div className="icon">{b.earned ? b.emoji : "🔒"}</div>
                  <div className="name">{b.name}</div>
                  <div className="desc">{b.description}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

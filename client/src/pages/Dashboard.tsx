import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { useGamify } from "../components/Gamify";
import { XpChart } from "../components/XpChart";
import type { SeasonEntry, SquadProfile } from "../types";

const KIND_ICON: Record<string, string> = { session: "📋", formation: "🔷", guidance: "💡", chat: "💬" };

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { progress } = useGamify();
  const [season, setSeason] = useState<SeasonEntry[]>([]);
  const [squad, setSquad] = useState<SquadProfile | null>(null);

  useEffect(() => {
    void getJSON<{ season: SeasonEntry[] }>("/api/season").then((r) => setSeason(r.season)).catch(() => {});
    void getJSON<{ squad: SquadProfile | null }>("/api/team").then((r) => setSquad(r.squad)).catch(() => {});
  }, [progress?.xp]);

  const lvl = progress?.level;

  return (
    <div className="fade-in">
      {/* Portfolio header — the Robinhood moment */}
      <div className="portfolio">
        <div className="portfolio-label">
          {squad ? squad.teamName : "Coaching Portfolio"} {squad && <span className="muted small">· {squad.ageGroup} · {squad.format}</span>}
        </div>
        <div className="portfolio-value">{(progress?.xp ?? 0).toLocaleString()} <span className="unit">XP</span></div>
        <div className={`portfolio-delta ${(progress?.xpToday ?? 0) > 0 ? "up" : ""}`}>
          {(progress?.xpToday ?? 0) > 0 ? `▲ +${progress?.xpToday} XP today` : "— no XP yet today"}
          {lvl && <span className="lvl-pill">Lv {lvl.level} · {lvl.title}</span>}
        </div>
        <XpChart history={progress?.xpHistory ?? []} />
        {lvl?.nextXp && (
          <div className="xp-meta" style={{ marginTop: 2 }}>
            <span>{lvl.nextXp - (progress?.xp ?? 0)} XP to {lvl.nextTitle}</span>
            <span>🔥 {progress?.streak ?? 0}-day streak</span>
          </div>
        )}
      </div>

      {/* Quick actions — the buy buttons */}
      <div className="action-row">
        <button className="action-tile" onClick={() => go("chat")}>
          <span className="action-emoji">💬</span>
          <b>Ask Coach T</b>
          <span className="muted small">Your assistant coach</span>
        </button>
        <button className="action-tile" onClick={() => go("studio")}>
          <span className="action-emoji">📋</span>
          <b>New Session</b>
          <span className="muted small">Visualized in seconds</span>
        </button>
        <button className="action-tile" onClick={() => go("advisors")}>
          <span className="action-emoji">🧠</span>
          <b>Advisors</b>
          <span className="muted small">{progress?.advisorsUsed ?? 0} consulted</span>
        </button>
        <button className="action-tile" onClick={() => go("library")}>
          <span className="action-emoji">📚</span>
          <b>Library</b>
          <span className="muted small">Schools of thought</span>
        </button>
        <button className="action-tile" onClick={() => go("matchday")}>
          <span className="action-emoji">📣</span>
          <b>Match Day</b>
          <span className="muted small">Pre · Live · Post</span>
        </button>
      </div>

      {!squad && (
        <div className="hero" style={{ padding: 18 }}>
          <b>Set up your team →</b>
          <p className="sub" style={{ margin: "4px 0 10px" }}>
            Give TactIQ your squad and it remembers your whole season — every answer becomes about <i>your</i> team.
          </p>
          <button className="btn" onClick={() => go("team")}>Set Up My Team</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Season Activity</h2>
          <span className="muted small">{season.length} entries</span>
        </div>
        {season.length === 0 && <p className="muted">Nothing yet — your first session starts the record.</p>}
        {season.slice(0, 8).map((e) => (
          <div key={e.id} className="season-row">
            <span className="kind">{KIND_ICON[e.kind] ?? "•"}</span>
            <div>
              <div className="title">{e.title}</div>
              <div className="muted small">{e.summary}</div>
            </div>
            <span className="when">{new Date(e.date).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

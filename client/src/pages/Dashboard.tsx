import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { XpBar, useGamify } from "../components/Gamify";
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

  return (
    <div className="fade-in">
      <div className="hero">
        <h1>
          {squad ? `${squad.teamName}` : "Your AI Assistant Coach"} <span style={{ fontSize: 22 }}>⚽</span>
        </h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          {squad
            ? `${squad.ageGroup} · ${squad.format} · ${squad.level} — TactIQ remembers your season and tailors everything to this team.`
            : "Design sessions, master tactics, and brainstorm with 24 coaching minds — built for US youth soccer."}
        </p>
        <div className="actions">
          <button className="btn" onClick={() => go("sessions")}>+ New Training Session</button>
          <button className="btn ghost" onClick={() => go("advisors")}>Brainstorm with an Advisor</button>
          {!squad && <button className="btn ghost" onClick={() => go("team")}>Set Up My Team</button>}
        </div>
      </div>

      <XpBar />

      <div className="stat-row" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="num orange">{progress?.streak ?? 0}🔥</div>
          <div className="label">Day Streak</div>
        </div>
        <div className="stat">
          <div className="num">{progress?.counts.session ?? 0}</div>
          <div className="label">Sessions Built</div>
        </div>
        <div className="stat">
          <div className="num">{progress?.counts.formation ?? 0}</div>
          <div className="label">Formations Analyzed</div>
        </div>
        <div className="stat">
          <div className="num">{progress?.advisorsUsed ?? 0}/24</div>
          <div className="label">Advisors Consulted</div>
        </div>
        <div className="stat">
          <div className="num">{progress ? progress.usage.limit - progress.usage.used : "—"}</div>
          <div className="label">Messages Left Today</div>
        </div>
      </div>

      <div className="card">
        <h2>Season Log</h2>
        {season.length === 0 && <p className="muted">Nothing yet — generate your first session and TactIQ starts building your season memory.</p>}
        {season.slice(0, 10).map((e) => (
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

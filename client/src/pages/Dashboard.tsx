import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { useGamify } from "../components/Gamify";
import { XpChart } from "../components/XpChart";
import { SessionPlanView } from "../components/SessionPlanView";
import { getOfflinePlans, type SavedPlan } from "../savedPlans";
import type { SeasonEntry, SquadProfile } from "../types";

const KIND_ICON: Record<string, string> = { session: "📋", formation: "🔷", guidance: "💡", chat: "💬", match: "📣", film: "🎬" };

// Sessions stashed in localStorage — they open even with zero connectivity,
// because the field has no wifi.
function OfflinePlans() {
  const [plans] = useState<SavedPlan[]>(getOfflinePlans);
  const [open, setOpen] = useState<SavedPlan | null>(null);

  if (plans.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>📥 Saved for the field</h2>
        <span className="muted small">works offline</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {plans.map((s) => (
          <button
            key={s.plan.title}
            className={`tab ${open?.plan.title === s.plan.title ? "active" : ""}`}
            onClick={() => setOpen(open?.plan.title === s.plan.title ? null : s)}
          >
            📋 {s.plan.title}
          </button>
        ))}
      </div>
      {open && <div style={{ marginTop: 12 }}><SessionPlanView plan={open.plan} /></div>}
    </div>
  );
}

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
          <b>Ask Coach Sam</b>
          <span className="muted small">Your assistant coach</span>
        </button>
        <button className="action-tile" onClick={() => go("studio")}>
          <span className="action-emoji">🔬</span>
          <b>The Labs</b>
          <span className="muted small">Sessions · Field Board · Scan</span>
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

      {progress?.quests && progress.quests.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>⚡ Today's Quests</h2>
            <span className="muted small">bonus XP · resets daily</span>
          </div>
          {progress.quests.map((q) => (
            <div key={q.id} className={`quest-row ${q.done ? "done" : ""}`}>
              <span className="q-emoji">{q.emoji}</span>
              <div style={{ flex: 1 }}>
                <div className="q-title">{q.title}</div>
                <div className="q-bar"><div className="fill" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} /></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="q-status">{q.done ? "✓ Done" : `${Math.min(q.progress, q.target)}/${q.target}`}</div>
                <div className="q-xp">+{q.bonusXp} XP</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!squad && (
        <div className="hero" style={{ padding: 18 }}>
          <b>Set up your team →</b>
          <p className="sub" style={{ margin: "4px 0 10px" }}>
            Give TactIQ your squad and it remembers your whole season — every answer becomes about <i>your</i> team.
          </p>
          <button className="btn" onClick={() => go("team")}>Set Up My Team</button>
        </div>
      )}

      <OfflinePlans />

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

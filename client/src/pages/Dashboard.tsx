import { useEffect, useState } from "react";
import { getJSON } from "../api";
import { useGamify } from "../components/Gamify";
import { XpChart } from "../components/XpChart";
import { SessionPlanView } from "../components/SessionPlanView";
import { getOfflinePlans, type SavedPlan } from "../savedPlans";
import { ArtifactRow } from "../components/ArtifactView";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { TouchlineDebate } from "../components/TouchlineDebate";
import type { SeasonEntry, SquadProfile } from "../types";

const KIND_ICON: Record<string, string> = { session: "📋", formation: "🔷", guidance: "💡", chat: "💬", match: "📣", film: "🎬" };

// Strip stored-markdown noise from memory summaries for display.
const clean = (s: string) => s.replace(/#+\s?/g, "").replace(/\[Demo mode[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

interface HomeData {
  clubTheme?: string | null;
  squad: SquadProfile | null;
  record: { w: number; d: number; l: number; gf: number; ga: number; form: string[] };
  lastMatch: { title: string; story: string; date: string } | null;
  nextGame: { opponent: string; date: string; location: string } | null;
  week: { id: number; start: string; title: string; kind: string; opponent: string; location: string }[];
  trainingBalance: Record<string, number>;
  sessionsLogged: number;
  suggestion: { theme: string; reason: string };
  briefing: string;
  staffMemo?: string;
}

function daysUntil(date: string): string | null {
  if (!date) return null;
  const d = Math.ceil((new Date(date.replace(" ", "T")).getTime() - Date.now()) / 86400000);
  if (d < 0) return null;
  return d === 0 ? "TODAY" : d === 1 ? "tomorrow" : `in ${d} days`;
}

const FORM_COLOR: Record<string, string> = { W: "var(--green)", L: "var(--red)", D: "var(--muted)" };
const PHASE_COLOR: Record<string, string> = {
  possession: "var(--turquoise)", attacking: "var(--accent)", defending: "var(--gold)",
  transition: "#7ef0ff", technical: "#c084fc",
};

// The Touchline hero: one card. Last game and next game are the two halves;
// the "train this next" bar spans beneath them — the bridge from what
// happened to what's coming.
function Touchline({ home, go, trainNext }: { home: HomeData; go: (tab: string) => void; trainNext: () => void }) {
  const countdown = home.nextGame ? daysUntil(home.nextGame.date) : null;
  return (
    <div className="card touchline">
      <div className="tl-grid">
        <div className="tl-side">
          <div className="tl-label">Last game</div>
          {home.lastMatch ? (
            <>
              <div className="tl-big">{home.lastMatch.title}</div>
              {home.lastMatch.story && <div className="tl-takeaway">“{home.lastMatch.story}”</div>}
            </>
          ) : (
            <>
              <div className="tl-big muted">No games logged yet</div>
              <button className="btn ghost tl-cta" onClick={() => go("matchday")}>Log your last game →</button>
            </>
          )}
        </div>
        <div className="tl-side tl-next">
          <div className="tl-label">Next game {countdown && <b style={{ color: "var(--accent)" }}>· {countdown}</b>}</div>
          {home.nextGame ? (
            <>
              <div className="tl-big">vs {home.nextGame.opponent}</div>
              <div className="muted small">{home.nextGame.date?.slice(0, 10)}{home.nextGame.location ? ` · ${home.nextGame.location}` : ""}</div>
              <button className="btn ghost tl-cta" onClick={() => go("matchday")}>Build game plan →</button>
            </>
          ) : (
            <>
              <div className="tl-big muted">Not scheduled</div>
              <button className="btn ghost tl-cta" onClick={() => go("team")}>Add your schedule →</button>
            </>
          )}
        </div>
      </div>
      <button className="tl-train" onClick={trainNext}>
        <span className="tl-train-main">🎯 Train this next: {home.suggestion.theme}</span>
        <span className="tl-train-why">{home.suggestion.reason} →</span>
      </button>
    </div>
  );
}

// The Week Board strip: the next 7 days, today glowing, every node actionable.
function WeekStrip({ home, go }: { home: HomeData; go: (tab: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    return {
      key,
      label: i === 0 ? "TODAY" : d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
      events: home.week.filter((e) => e.start.slice(0, 10) === key),
    };
  });
  if (home.week.length === 0) return null;
  return (
    <div className="week-strip">
      {days.map((d, i) => {
        const game = d.events.find((e) => e.kind === "game");
        const practice = d.events.find((e) => e.kind === "practice");
        const main = game ?? practice ?? d.events[0];
        return (
          <div key={d.key} className={`card week-cell ${i === 0 ? "today" : ""} ${game ? "game" : ""} ${!main ? "empty" : ""}`}>
            <div className="wk-day">{d.label}</div>
            {main ? (
              <>
                <div className="wk-title">{game ? `vs ${game.opponent || "TBD"}` : main.title}</div>
                <button
                  className="wk-action"
                  onClick={() => go(game ? "matchday" : practice ? "studio" : "team")}
                >
                  {game ? "Game plan →" : practice ? "Plan session →" : "Schedule →"}
                </button>
              </>
            ) : (
              <div className="muted small">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Coach Sam's written morning briefing — the product speaking first.
function Briefing({ text, go }: { text: string; go: (tab: string) => void }) {
  if (!text) return null;
  return (
    <div className="briefing card">
      <div className="brief-head">
        <div className="coach-avatar">🧡</div>
        <div>
          <b>Today's briefing</b>
          <span className="muted small" style={{ display: "block" }}>Coach Sam</span>
        </div>
      </div>
      <p className="brief-text">{text}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn ghost" style={{ fontSize: 13 }} onClick={() => go("chat")}>Ask a follow-up…</button>
      </div>
    </div>
  );
}

// Mission Control vitals: record, goals, and the training-balance meter.
function Vitals({ home }: { home: HomeData }) {
  const phases = Object.entries(home.trainingBalance);
  const max = Math.max(1, ...phases.map(([, n]) => n));
  const gap = phases.filter(([, n]) => n === 0).map(([p]) => p);
  return (
    <div className="grid cols-2" style={{ alignItems: "start", marginBottom: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>📊 Season vitals</h3>
        <div className="vitals-row">
          <div><div className="v-num">{home.record.w}-{home.record.d}-{home.record.l}</div><div className="muted small">Record</div></div>
          <div><div className="v-num">{home.record.gf}–{home.record.ga}</div><div className="muted small">Goals</div></div>
          <div>
            <div className="v-num" style={{ display: "flex", gap: 4 }}>
              {home.record.form.length > 0
                ? home.record.form.map((f, i) => <span key={i} style={{ color: FORM_COLOR[f] ?? "var(--muted)" }}>{f}</span>)
                : <span className="muted">—</span>}
            </div>
            <div className="muted small">Form</div>
          </div>
          <div><div className="v-num">{home.sessionsLogged}</div><div className="muted small">Sessions</div></div>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>⚖️ Training balance <span className="muted small">last 6 sessions</span></h3>
        {phases.map(([phase, n]) => (
          <div key={phase} className="balance-row">
            <span className="b-label">{phase}</span>
            <div className="b-track"><div className="b-fill" style={{ width: `${(n / max) * 100}%`, background: PHASE_COLOR[phase] }} /></div>
            <span className="b-count">{n}{n === 0 ? " ⚠" : ""}</span>
          </div>
        ))}
        {gap.length > 0 && home.sessionsLogged > 2 && (
          <p className="small" style={{ color: "var(--accent-soft)", margin: "8px 0 0" }}>
            You haven't trained {gap.join(" or ")} recently.
          </p>
        )}
      </div>
    </div>
  );
}

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
  const [home, setHome] = useState<HomeData | null>(null);
  const [season, setSeason] = useState<SeasonEntry[]>([]);

  useEffect(() => {
    void getJSON<HomeData>("/api/home").then(setHome).catch(() => {});
    void getJSON<{ season: SeasonEntry[] }>("/api/season").then((r) => setSeason(r.season)).catch(() => {});
  }, [progress?.xp]);

  // "Train this next" → Session Studio, pre-filled with the suggested theme.
  function trainNext() {
    if (home) sessionStorage.setItem("tactiq:prefillTheme", home.suggestion.theme);
    go("studio");
  }

  const lvl = progress?.level;
  const squad = home?.squad ?? null;

  return (
    <div className="fade-in">
      {/* Header: the team, its record, and the coach's chips */}
      <div className="home-head">
        <div>
          <h1 style={{ margin: 0 }}>{squad ? squad.teamName : "Welcome, coach"}</h1>
          <span className="muted small">
            {squad ? `${squad.ageGroup} · ${squad.format} · ${squad.level}` : "Set up your team to unlock the full desk"}
          </span>
        </div>
        <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <TeamSwitcher />
          {lvl && <span className="chip">Lv {lvl.level} · {lvl.title}</span>}
          <span className="chip">🔥 {progress?.streak ?? 0}</span>
          <span className="chip">⚡ {(progress?.xp ?? 0).toLocaleString()} XP</span>
        </div>
      </div>

      {home?.clubTheme && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--turquoise)", padding: "10px 16px" }}>
          <span className="small"><b style={{ color: "var(--turquoise)" }}>🏛️ Club theme this week:</b> {home.clubTheme} — sessions and advice align to it automatically.</span>
        </div>
      )}
      {!squad && (
        <div className="hero" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Two minutes of setup, a whole season of memory</h2>
          <p className="sub" style={{ margin: "4px 0 14px" }}>
            Give TactIQ your squad and schedule — every session, game plan, and answer becomes about <i>your</i> team.
          </p>
          <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => go("team")}>🛡️ Set up my team</button>
            <button className="btn ghost" onClick={() => go("team")}>📅 Import my schedule</button>
          </span>
        </div>
      )}
      {home && <Touchline home={home} go={go} trainNext={trainNext} />}
      {home && <Briefing text={home.briefing} go={go} />}
      {home?.staffMemo && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid var(--gold)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ margin: 0 }}>🗣️ Staff memo</h2>
            <span className="muted small">Coach Sam + your most-consulted advisors · weekly</span>
          </div>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{home.staffMemo.replace(/\*\*(.+?)\*\*/g, "$1")}</div>
        </div>
      )}
      {home && <WeekStrip home={home} go={go} />}
      {home && (home.record.w + home.record.d + home.record.l > 0 || home.sessionsLogged > 0) && <Vitals home={home} />}
      {squad && <div style={{ marginBottom: 16 }}><TouchlineDebate /></div>}

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

      <OfflinePlans />

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Season Activity</h2>
          <span className="muted small">{season.length} entries</span>
        </div>
        {season.length === 0 && <p className="muted">Nothing yet — your first session starts the record.</p>}
        {season.slice(0, 8).map((e) => (
          <ArtifactRow key={e.id} entry={e}>
            <span className="kind">{KIND_ICON[e.kind] ?? "•"}</span>
            <div>
              <div className="title">{e.title}</div>
              <div className="muted small">{clean(e.summary).slice(0, 150)}</div>
            </div>
            <span className="when">{new Date(e.date).toLocaleDateString()}</span>
          </ArtifactRow>
        ))}
      </div>

      {/* The coaching portfolio — gamification lives below the team now */}
      <div className="portfolio" style={{ marginTop: 16 }}>
        <div className="portfolio-label">Coaching Portfolio</div>
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
    </div>
  );
}

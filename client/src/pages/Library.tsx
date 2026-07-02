import { useEffect, useMemo, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import type { AwardResult, SessionPlan, SessionTemplate } from "../types";

const PHASES = [
  { id: "all", label: "All", emoji: "✨" },
  { id: "attacking", label: "Attacking", emoji: "⚔️" },
  { id: "defending", label: "Defending", emoji: "🛡️" },
  { id: "possession", label: "Possession", emoji: "🔁" },
  { id: "transition", label: "Transition", emoji: "🌊" },
  { id: "technical", label: "Technical", emoji: "🎯" },
  { id: "set-pieces", label: "Set Pieces", emoji: "📐" },
  { id: "goalkeeping", label: "Goalkeeping", emoji: "🧤" },
  { id: "athletic", label: "Games & More", emoji: "🏟️" },
];

const BANDS = ["all", "U6-U8", "U9-U10", "U11-U12", "U13-U14", "U15-U16", "HS"];
const LEVELS = ["all", "foundation", "intermediate", "advanced"];

export function Library() {
  const { celebrate } = useGamify();
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [phase, setPhase] = useState("all");
  const [band, setBand] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [openPlan, setOpenPlan] = useState<{ plan: SessionPlan; entryId?: number } | null>(null);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const r = await getJSON<{ templates: SessionTemplate[] }>("/api/library");
    setTemplates(r.templates);
  }

  useEffect(() => {
    void load().catch(() => {});
  }, []);

  const list = useMemo(
    () =>
      templates.filter(
        (t) =>
          (phase === "all" || t.phase === phase) &&
          (band === "all" || t.ageBand === band) &&
          (level === "all" || t.complexity === level) &&
          (!search || `${t.topicName} ${t.description}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [templates, phase, band, level, search],
  );

  async function unlock(t: SessionTemplate) {
    setError("");
    setLoadingId(t.id);
    try {
      const r = await sendJSON<{ plan: SessionPlan; award?: AwardResult; entryId?: number }>(`/api/library/${t.id}/generate`, {});
      setOpenPlan({ plan: r.plan, entryId: r.entryId });
      if (r.award) celebrate(r.award);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoadingId("");
  }

  if (openPlan) {
    return (
      <div className="fade-in">
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setOpenPlan(null)}>← Library</button>
        <SessionPlanView plan={openPlan.plan} entryId={openPlan.entryId} />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1>The Library</h1>
      <p className="sub">
        <b>{templates.length.toLocaleString()} session blueprints</b> across every topic, phase, age band, and complexity level.
        Unlock any of them and TactIQ builds the full session live — visualized, animated, and adapted to <i>your</i> team, so no
        two coaches get the same session.
      </p>

      <div className="tabs">
        {PHASES.map((p) => (
          <button key={p.id} className={`tab ${phase === p.id ? "active" : ""}`} onClick={() => setPhase(p.id)}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      <div className="form-grid" style={{ maxWidth: 720, marginBottom: 16 }}>
        <label className="field">
          Age band
          <select value={band} onChange={(e) => setBand(e.target.value)}>
            {BANDS.map((b) => <option key={b} value={b}>{b === "all" ? "All ages" : b}</option>)}
          </select>
        </label>
        <label className="field">
          Complexity
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l === "all" ? "All levels" : l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">
          Search topics
          <input value={search} placeholder="e.g. pressing, finishing, build-up…" onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && <div className="error-box">{error}</div>}
      <p className="muted small" style={{ margin: "0 0 10px" }}>{list.length.toLocaleString()} sessions match</p>

      <div className="grid cols-2">
        {list.slice(0, 60).map((t) => (
          <div key={t.id} className="card clickable" onClick={() => void unlock(t)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <span className="phase-tag">{t.emoji} {t.phase.replace("-", " ")} · {t.complexity}</span>
                <h3 style={{ margin: "3px 0 4px" }}>{t.topicName}</h3>
                <p className="muted small" style={{ margin: 0 }}>{t.description}</p>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span className="chip">{t.ageBand} · {t.format}</span>
                <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: t.unlocked ? "var(--green)" : "var(--accent)" }}>
                  {loadingId === t.id ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> : t.unlocked ? "✓ Unlocked" : "Unlock →"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {list.length > 60 && <p className="muted small" style={{ marginTop: 12 }}>Showing 60 of {list.length} — narrow the filters to find your session.</p>}
    </div>
  );
}

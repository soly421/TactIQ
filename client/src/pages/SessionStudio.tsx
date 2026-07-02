import { useState } from "react";
import { sendJSON } from "../api";
import { PitchDiagram } from "../components/PitchDiagram";
import { useGamify } from "../components/Gamify";
import type { AwardResult, SessionPlan } from "../types";

const AGE_GROUPS = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17+"];

export function SessionStudio() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({
    ageGroup: "U10",
    playersAvailable: "12",
    durationMinutes: "75",
    theme: "",
    level: "travel",
    notes: "",
  });
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.theme.trim()) {
      setError("Give the session a theme — e.g. 'pressing triggers' or 'finishing in the box'.");
      return;
    }
    setError("");
    setLoading(true);
    setPlan(null);
    try {
      const res = await sendJSON<{ plan: SessionPlan; award: AwardResult }>("/api/session-plan", {
        ...form,
        playersAvailable: Number(form.playersAvailable) || undefined,
        durationMinutes: Number(form.durationMinutes) || 75,
      });
      setPlan(res.plan);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  }

  return (
    <div className="fade-in">
      <h1>Session Studio</h1>
      <p className="sub">Describe what you want to train — get a full session with visualized, animated drill diagrams. Saved to your season automatically.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <label className="field">
            Age group
            <select value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)}>
              {AGE_GROUPS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="field">
            Players available
            <input type="number" value={form.playersAvailable} onChange={(e) => set("playersAvailable", e.target.value)} />
          </label>
          <label className="field">
            Duration (min)
            <input type="number" value={form.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} />
          </label>
          <label className="field">
            Level
            <select value={form.level} onChange={(e) => set("level", e.target.value)}>
              <option value="rec">Recreational</option>
              <option value="travel">Travel / Club</option>
              <option value="academy">Academy / Elite</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Session theme
          <input
            value={form.theme}
            placeholder="e.g. Playing out of the back against a press"
            onChange={(e) => set("theme", e.target.value)}
          />
        </label>
        <label className="field" style={{ marginBottom: 16 }}>
          Notes (optional)
          <textarea
            value={form.notes}
            placeholder="Anything specific — struggling players, last game's problems, equipment limits…"
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        <button className="btn" onClick={() => void generate()} disabled={loading}>
          {loading ? "Designing your session…" : "⚡ Generate Session"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>

      {loading && (
        <div className="gen-overlay">
          <span className="spinner" />
          <div>Your assistant coach is drawing up the session…</div>
        </div>
      )}

      {plan && (
        <div className="fade-in">
          <div className="hero" style={{ paddingBottom: 20 }}>
            <h1 style={{ fontSize: 24 }}>{plan.title}</h1>
            <p className="sub" style={{ margin: 0 }}>
              {plan.ageGroup} · {plan.durationMinutes} min · {plan.theme}
            </p>
          </div>

          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3>🎯 Objectives</h3>
              <ul className="points">{plan.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </div>
            <div className="card">
              <h3>🎒 Equipment</h3>
              <ul className="points">{plan.equipment.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </div>
          </div>

          {plan.drills.map((d, i) => (
            <div key={i} className="card drill">
              <div className="drill-head">
                <div>
                  <span className="phase-tag">{d.phase.replace(/-/g, " ")}</span>
                  <h3 style={{ margin: "2px 0 4px" }}>
                    {i + 1}. {d.name}
                  </h3>
                </div>
                <span className="chip">{d.durationMinutes} min · {d.area}</span>
              </div>
              <div className="grid cols-2" style={{ alignItems: "start" }}>
                <PitchDiagram diagram={d.diagram} />
                <div>
                  <p className="small" style={{ lineHeight: 1.6 }}>{d.organization}</p>
                  <h3 style={{ color: "var(--accent)", fontSize: 14 }}>Coaching points</h3>
                  <ul className="points">{d.coachingPoints.map((c, j) => <li key={j}>{c}</li>)}</ul>
                  {d.progressions.length > 0 && (
                    <>
                      <h3 style={{ fontSize: 14 }}>Progressions</h3>
                      <ul className="points">{d.progressions.map((c, j) => <li key={j}>{c}</li>)}</ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="card">
            <h3>🧠 Coach reminders</h3>
            <ul className="points">{plan.coachReminders.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

import { savePlanOffline } from "../savedPlans";
import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import type { AwardResult, School, SessionPlan, SquadProfile } from "../types";

const AGE_GROUPS = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17+", "HS"];

export function SessionStudio() {
  const { celebrate } = useGamify();
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState({
    ageGroup: "U10",
    playersAvailable: "12",
    durationMinutes: "75",
    theme: "",
    level: "travel",
    school: "",
    notes: "",
  });
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [entryId, setEntryId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<{ schools: School[] }>("/api/library").then((r) => setSchools(r.schools)).catch(() => {});
    // The designer knows your team: age, level, and roster size come from the
    // saved profile instead of being asked again.
    void getJSON<{ squad: SquadProfile | null }>("/api/team")
      .then((r) => {
        if (!r.squad) return;
        const squad = r.squad;
        setForm((f) => ({
          ...f,
          ageGroup: squad.ageGroup && AGE_GROUPS.includes(squad.ageGroup) ? squad.ageGroup : f.ageGroup,
          level: squad.level || f.level,
          playersAvailable: squad.players?.length ? String(squad.players.length) : f.playersAvailable,
        }));
      })
      .catch(() => {});
    // "Train this next" hand-off from the home page.
    const prefill = sessionStorage.getItem("tactiq:prefillTheme");
    if (prefill) {
      sessionStorage.removeItem("tactiq:prefillTheme");
      setForm((f) => ({ ...f, theme: prefill }));
    }
  }, []);

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
      const res = await sendJSON<{ plan: SessionPlan; award: AwardResult; entryId?: number }>("/api/session-plan", {
        ...form,
        playersAvailable: Number(form.playersAvailable) || undefined,
        durationMinutes: Number(form.durationMinutes) || 75,
        school: form.school || undefined,
      });
      setPlan(res.plan);
      savePlanOffline(res.plan);
      setEntryId(res.entryId);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  }

  return (
    <div className="fade-in">
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
              <option value="hs">High School</option>
            </select>
          </label>
          <label className="field">
            School of thought (optional)
            <select value={form.school} onChange={(e) => set("school", e.target.value)}>
              <option value="">TactIQ blend</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
              ))}
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

      {plan && <SessionPlanView plan={plan} entryId={entryId} />}
    </div>
  );
}

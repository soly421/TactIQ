import { savePlanOffline } from "../savedPlans";
import { useEffect, useMemo, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { ArtifactRow } from "../components/ArtifactView";
import { Library } from "./Library";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import type { AwardResult, School, SeasonEntry, SessionPlan, SquadProfile } from "../types";

const AGE_GROUPS = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17+", "HS"];

export function SessionStudio() {
  const { celebrate } = useGamify();
  const [mode, setMode] = useState<"design" | "library" | "mine">("design");
  const [mine, setMine] = useState<SeasonEntry[]>([]);
  const [query, setQuery] = useState("");
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
    // The repository: every session ever designed for this team, reopenable.
    void getJSON<{ season: SeasonEntry[] }>("/api/season?limit=500")
      .then((r) => setMine(r.season.filter((e) => e.kind === "session")))
      .catch(() => {});
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
      if (res.entryId) setMine((m) => [{ id: res.entryId!, date: new Date().toISOString(), kind: "session", title: res.plan.title, summary: res.plan.theme, hasArtifact: true }, ...m]);
      setEntryId(res.entryId);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((e) => `${e.title} ${e.summary}`.toLowerCase().includes(q));
  }, [mine, query]);

  return (
    <div className="fade-in">
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${mode === "design" ? "active" : ""}`} onClick={() => setMode("design")}>⚡ Design a session</button>
        <button className={`tab ${mode === "library" ? "active" : ""}`} onClick={() => setMode("library")}>📚 Start from the Library</button>
        <button className={`tab ${mode === "mine" ? "active" : ""}`} onClick={() => setMode("mine")}>📁 My sessions{mine.length ? ` (${mine.length})` : ""}</button>
      </div>

      {mode === "library" && <Library embedded />}

      {mode === "mine" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Your session repository</h2>
            <input
              style={{ minWidth: 220 }}
              placeholder="Search by theme, title, exercise…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="muted small">
            Every session you design is saved to your team's season record automatically — tap one to reopen the full plan with diagrams.
          </p>
          {filtered.length === 0 && (
            <p className="muted">{mine.length === 0 ? "Nothing yet — design your first session and it lands here." : "No sessions match that search."}</p>
          )}
          {filtered.slice(0, 40).map((e) => (
            <ArtifactRow key={e.id} entry={e}>
              <span className="kind">📋</span>
              <div>
                <div className="title">{e.title}</div>
                <div className="muted small">{e.summary.slice(0, 150)}</div>
              </div>
              <span className="when">{new Date(e.date).toLocaleDateString()}</span>
            </ArtifactRow>
          ))}
          {filtered.length > 40 && <p className="muted small">Showing 40 of {filtered.length} — narrow the search to find older ones.</p>}
        </div>
      )}

      {mode === "design" && (
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="muted small" style={{ marginTop: 0 }}>
          🇺🇸 Sessions follow the U.S. Soccer play-practice-play arc — arrival activity → technique → skill under pressure → the game — with standard diagram notation.
        </p>
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
      )}

      {mode === "design" && loading && (
        <div className="gen-overlay">
          <span className="spinner" />
          <div>Your assistant coach is drawing up the session…</div>
        </div>
      )}

      {mode === "design" && plan && <SessionPlanView plan={plan} entryId={entryId} />}
    </div>
  );
}

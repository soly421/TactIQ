import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { formatForAge, NO_FORMATION_NOTE } from "../age";
import { FormationPitch } from "../components/FormationPitch";
import { useGamify } from "../components/Gamify";
import { RateBar } from "../components/RateBar";
import type { AwardResult, FormationAnalysis, SquadProfile } from "../types";

export function FormationLab() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({
    depth: "standard",
    format: "9v9",
    ageGroup: "U11",
    style: "",
    squadNotes: "",
    opponentNotes: "",
  });
  const [analysis, setAnalysis] = useState<FormationAnalysis | null>(null);
  const [entryId, setEntryId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The lab knows your team: age + style come from the saved profile, and the
  // format is derived from age (US Soccer standard), never asked twice.
  useEffect(() => {
    void getJSON<{ squad: SquadProfile | null }>("/api/team")
      .then((r) => {
        if (!r.squad?.ageGroup) return;
        const derived = formatForAge(r.squad.ageGroup);
        setForm((f) => ({
          ...f,
          ageGroup: r.squad!.ageGroup,
          // 4v4 ages get the 7v7 board to prepare for what's next
          format: derived ? (derived === "4v4" ? "7v7" : derived) : ["7v7", "9v9", "11v11"].includes(r.squad!.format) ? r.squad!.format : f.format,
          style: f.style || r.squad!.preferredStyle || "",
        }));
      })
      .catch(() => {});
  }, []);

  // Age drives format automatically; the coach can still override the format
  // select afterwards for leagues that deviate from the standard.
  const set = (k: string, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "ageGroup") {
        const derived = formatForAge(v);
        if (derived) next.format = derived === "4v4" ? "7v7" : derived;
      }
      return next;
    });

  const smallSided = formatForAge(form.ageGroup) === "4v4";

  async function generate() {
    setError("");
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await sendJSON<{ analysis: FormationAnalysis; award: AwardResult; entryId?: number }>("/api/formation", form);
      setAnalysis(res.analysis);
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
            <input value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} placeholder="e.g. U11" />
          </label>
          <label className="field">
            Game format <span className="muted small">(set by age — override if your league differs)</span>
            <select value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option>7v7</option>
              <option>9v9</option>
              <option>11v11</option>
            </select>
          </label>
          <label className="field">
            Analysis depth
            <select value={form.depth} onChange={(e) => set("depth", e.target.value)}>
              <option value="quick">⚡ Quick — fast take</option>
              <option value="standard">🔷 Standard — full game model</option>
              <option value="deep">🧠 Deep Tactical — flagship engine (Pro)</option>
            </select>
          </label>
          <label className="field">
            Desired style
            <input value={form.style} onChange={(e) => set("style", e.target.value)} placeholder="e.g. possession, counter, high press…" />
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Squad characteristics
          <textarea
            value={form.squadNotes}
            placeholder="e.g. Fast wingers, small but technical mids, keeper good with feet, one dominant defender…"
            onChange={(e) => set("squadNotes", e.target.value)}
          />
        </label>
        <label className="field" style={{ marginBottom: 16 }}>
          League / opponent context (optional)
          <textarea
            value={form.opponentNotes}
            placeholder="e.g. Most teams in our league press high and play a 3-3-2…"
            onChange={(e) => set("opponentNotes", e.target.value)}
          />
        </label>
        {smallSided && (
          <p className="muted small" style={{ marginTop: 0 }}>⚽ {NO_FORMATION_NOTE}</p>
        )}
        <button className="btn" onClick={() => void generate()} disabled={loading}>
          {loading ? "Analyzing…" : "🔬 Analyze Formation"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>

      {loading && (
        <div className="gen-overlay">
          <span className="spinner" />
          <div>Building your game model…</div>
        </div>
      )}

      {analysis && (
        <div className="fade-in">
          <div className="hero" style={{ paddingBottom: 20 }}>
            <h1 style={{ fontSize: 26 }}>{analysis.recommendedFormation}</h1>
            <p className="sub" style={{ margin: 0 }}>{analysis.formationRationale}</p>
          </div>

          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <div className="card">
              <h3>The Shape</h3>
              <FormationPitch positions={analysis.positions} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="card">
                <h3>⚡ In possession</h3>
                <ul className="points">{analysis.inPossession.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div className="card">
                <h3>🛡️ Out of possession</h3>
                <ul className="points">{analysis.outOfPossession.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div className="card">
                <h3>🔁 Transitions</h3>
                <ul className="points">{analysis.transitions.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          </div>

          <div className="grid cols-3" style={{ marginTop: 14 }}>
            <div className="card">
              <h3 style={{ color: "var(--green)" }}>Strengths</h3>
              <ul className="points">{analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="card">
              <h3 style={{ color: "var(--red)" }}>Vulnerabilities</h3>
              <ul className="points">{analysis.vulnerabilities.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div className="card">
              <h3 style={{ color: "var(--accent)" }}>Train these next</h3>
              <ul className="points">{analysis.trainingPriorities.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>
          <RateBar kind="formation" entryId={entryId} />
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { sendJSON } from "../api";
import { FormationPitch } from "../components/FormationPitch";
import { useGamify } from "../components/Gamify";
import type { AwardResult, FormationAnalysis } from "../types";

export function FormationLab() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({
    format: "9v9",
    ageGroup: "U11",
    style: "",
    squadNotes: "",
    opponentNotes: "",
  });
  const [analysis, setAnalysis] = useState<FormationAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    setError("");
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await sendJSON<{ analysis: FormationAnalysis; award: AwardResult }>("/api/formation", form);
      setAnalysis(res.analysis);
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
            Game format
            <select value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option>4v4</option>
              <option>7v7</option>
              <option>9v9</option>
              <option>11v11</option>
            </select>
          </label>
          <label className="field">
            Age group
            <input value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} placeholder="e.g. U11" />
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
        </div>
      )}
    </div>
  );
}

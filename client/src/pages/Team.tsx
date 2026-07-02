import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { useGamify } from "../components/Gamify";
import type { AwardResult, SquadProfile } from "../types";

const EMPTY: SquadProfile = {
  teamName: "",
  coachExperience: "intermediate",
  ageGroup: "U10",
  format: "7v7",
  level: "travel",
  preferredStyle: "",
  rosterNotes: "",
  seasonGoals: "",
};

export function Team() {
  const { celebrate } = useGamify();
  const [squad, setSquad] = useState<SquadProfile>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<{ squad: SquadProfile | null }>("/api/team")
      .then((r) => r.squad && setSquad(r.squad))
      .catch(() => {});
  }, []);

  const set = (k: keyof SquadProfile, v: string) => {
    setSaved(false);
    setSquad((s) => ({ ...s, [k]: v }));
  };

  async function save() {
    setError("");
    try {
      const res = await sendJSON<{ squad: SquadProfile; award: AwardResult }>("/api/team", squad, "PUT");
      setSquad(res.squad);
      setSaved(true);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="fade-in">
      <h1>My Team</h1>
      <p className="sub">
        This is TactIQ's season-long memory. Everything you enter here flows into every advisor chat, session plan, and formation —
        so the advice is about <b>your</b> team, not a generic one.
      </p>

      <div className="card">
        <div className="form-grid">
          <label className="field">
            Team name
            <input value={squad.teamName} onChange={(e) => set("teamName", e.target.value)} placeholder="e.g. Thunder SC 2016 Orange" />
          </label>
          <label className="field">
            Age group
            <input value={squad.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} placeholder="e.g. U10" />
          </label>
          <label className="field">
            Game format
            <select value={squad.format} onChange={(e) => set("format", e.target.value)}>
              <option>4v4</option>
              <option>7v7</option>
              <option>9v9</option>
              <option>11v11</option>
            </select>
          </label>
          <label className="field">
            Level
            <select value={squad.level} onChange={(e) => set("level", e.target.value)}>
              <option value="rec">Recreational</option>
              <option value="travel">Travel / Club</option>
              <option value="academy">Academy / Elite</option>
            </select>
          </label>
          <label className="field">
            Your coaching experience
            <select value={squad.coachExperience} onChange={(e) => set("coachExperience", e.target.value)}>
              <option value="new">New — first seasons (plain language, exact setups)</option>
              <option value="intermediate">Intermediate — a few seasons</option>
              <option value="experienced">Experienced / licensed (full tactical depth)</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Preferred playing style
          <input
            value={squad.preferredStyle}
            onChange={(e) => set("preferredStyle", e.target.value)}
            placeholder="e.g. Possession-based, build from the back, high press"
          />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          Roster notes
          <textarea
            value={squad.rosterNotes}
            rows={3}
            onChange={(e) => set("rosterNotes", e.target.value)}
            placeholder="Strengths, weaknesses, key players (first names only), goalkeeper situation, attendance patterns…"
          />
        </label>
        <label className="field" style={{ marginBottom: 16 }}>
          Season goals
          <textarea
            value={squad.seasonGoals}
            rows={2}
            onChange={(e) => set("seasonGoals", e.target.value)}
            placeholder="e.g. Every player confident receiving under pressure by spring; win the fall tournament"
          />
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn" onClick={() => void save()} disabled={!squad.teamName || !squad.ageGroup}>
            💾 Save Team
          </button>
          {saved && <span style={{ color: "var(--green)", fontWeight: 700 }}>Saved — your advisors now know this team ✓</span>}
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { useGamify } from "../components/Gamify";
import type { AwardResult, PlayerNote, SquadProfile } from "../types";

const EMPTY: SquadProfile = {
  teamName: "",
  players: [],
  coachExperience: "intermediate",
  ageGroup: "U10",
  format: "7v7",
  level: "travel",
  preferredStyle: "",
  rosterNotes: "",
  seasonGoals: "",
};

const EMPTY_PLAYER: PlayerNote = { name: "", number: "", positions: "", foot: "", notes: "" };

export function Team() {
  const { celebrate } = useGamify();
  const [squad, setSquad] = useState<SquadProfile>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<{ squad: SquadProfile | null }>("/api/team")
      .then((r) => r.squad && setSquad({ ...EMPTY, ...r.squad }))
      .catch(() => {});
  }, []);

  const set = (k: keyof SquadProfile, v: unknown) => {
    setSaved(false);
    setSquad((s) => ({ ...s, [k]: v }));
  };

  const setPlayer = (i: number, k: keyof PlayerNote, v: string) => {
    setSaved(false);
    setSquad((s) => {
      const players = [...(s.players ?? [])];
      players[i] = { ...players[i], [k]: v };
      return { ...s, players };
    });
  };

  async function save() {
    setError("");
    try {
      const res = await sendJSON<{ squad: SquadProfile; award: AwardResult }>("/api/team", squad, "PUT");
      setSquad({ ...EMPTY, ...res.squad });
      setSaved(true);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  const players = squad.players ?? [];

  return (
    <div className="fade-in">
      <h1>My Team</h1>
      <p className="sub">
        TactIQ's season-long memory. Everything here — including your roster — flows into every advisor, session, formation, and
        Match Day briefing, so guidance is about <b>your actual players</b>.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Team profile</h2>
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
              <option value="hs">High School</option>
            </select>
          </label>
          <label className="field">
            Your coaching experience
            <select value={squad.coachExperience} onChange={(e) => set("coachExperience", e.target.value)}>
              <option value="new">New — first seasons</option>
              <option value="intermediate">Intermediate</option>
              <option value="experienced">Experienced / licensed</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Preferred playing style
          <input value={squad.preferredStyle} onChange={(e) => set("preferredStyle", e.target.value)} placeholder="e.g. Possession, build from the back, high press" />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          Team notes
          <textarea value={squad.rosterNotes} rows={2} onChange={(e) => set("rosterNotes", e.target.value)} placeholder="Team-level strengths/weaknesses, attendance patterns, keeper situation…" />
        </label>
        <label className="field">
          Season goals
          <textarea value={squad.seasonGoals} rows={2} onChange={(e) => set("seasonGoals", e.target.value)} placeholder="e.g. Every player confident receiving under pressure by spring" />
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2>Roster ({players.filter((p) => p.name).length})</h2>
          <span className="muted small">First names or initials only — protect the kids' privacy.</span>
        </div>
        <table className="roster-table">
          <thead>
            <tr><th style={{ width: "22%" }}>Player</th><th style={{ width: "8%" }}>#</th><th style={{ width: "18%" }}>Positions</th><th style={{ width: "12%" }}>Foot</th><th>Notes (strengths, needs, temperament)</th><th /></tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} placeholder="Maya R." onChange={(e) => setPlayer(i, "name", e.target.value)} /></td>
                <td><input value={p.number} placeholder="7" onChange={(e) => setPlayer(i, "number", e.target.value)} /></td>
                <td><input value={p.positions} placeholder="CM, RW" onChange={(e) => setPlayer(i, "positions", e.target.value)} /></td>
                <td>
                  <select value={p.foot} onChange={(e) => setPlayer(i, "foot", e.target.value)}>
                    <option value="">—</option><option>R</option><option>L</option><option>Both</option>
                  </select>
                </td>
                <td><input value={p.notes} placeholder="Great engine, needs confidence on the ball" onChange={(e) => setPlayer(i, "notes", e.target.value)} /></td>
                <td><button className="del" title="Remove" onClick={() => set("players", players.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => set("players", [...players, { ...EMPTY_PLAYER }])}>
          + Add player
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button className="btn" onClick={() => void save()} disabled={!squad.teamName || !squad.ageGroup}>
          💾 Save Team
        </button>
        {saved && <span style={{ color: "var(--green)", fontWeight: 700 }}>Saved — your AI staff knows this team ✓</span>}
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3>🔌 Integrations</h3>
        <p className="muted small" style={{ lineHeight: 1.6 }}>
          <b>Veo / Trace / Hudl:</b> today, paste match reports or upload stat screenshots in Match Day → Post-Game and TactIQ analyzes them.
          Direct API connections (auto-import your match analytics after every game) require partner API access from those platforms and are
          the next integration milestone — the data pipeline is already built to receive them.
        </p>
      </div>
    </div>
  );
}

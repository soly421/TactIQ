import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { formatForAge } from "../age";

export interface TeamListItem {
  id: number;
  active: boolean;
  teamName: string;
  ageGroup: string;
  format: string;
  level: string;
  players: number;
}

// Multi-team switcher: shows nothing for single-team coaches (the common
// case stays clean); with 2+ teams it's a select that swaps the whole app's
// active context — memory, schedule, library, prompts.
export function TeamSwitcher({ withCreate }: { withCreate?: boolean }) {
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState({ teamName: "", ageGroup: "U10", format: "7v7" });

  useEffect(() => {
    void getJSON<{ teams: TeamListItem[] }>("/api/teams").then((r) => setTeams(r.teams)).catch(() => {});
  }, []);

  async function activate(id: number) {
    await sendJSON(`/api/teams/${id}/activate`, {});
    window.location.reload(); // every page's data is team-scoped — full refresh is the honest swap
  }

  async function create() {
    if (!newTeam.teamName.trim()) return;
    await sendJSON("/api/teams", { ...newTeam, level: "travel" });
    window.location.reload();
  }

  if (teams.length <= 1 && !withCreate) return null;

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {teams.length > 1 && (
        <select
          value={teams.find((t) => t.active)?.id ?? ""}
          onChange={(e) => void activate(Number(e.target.value))}
          title="Switch team — memory, schedule, and roster all follow"
          style={{ fontWeight: 700 }}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>🛡️ {t.teamName} ({t.ageGroup})</option>
          ))}
        </select>
      )}
      {withCreate && !creating && teams.length < 8 && (
        <button className="btn ghost" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => setCreating(true)}>
          + Add a team
        </button>
      )}
      {creating && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            style={{ width: 150 }}
            placeholder="Team name"
            value={newTeam.teamName}
            onChange={(e) => setNewTeam((f) => ({ ...f, teamName: e.target.value }))}
          />
          <input
            style={{ width: 60 }}
            placeholder="U10"
            value={newTeam.ageGroup}
            onChange={(e) => {
              const age = e.target.value;
              // age sets the format automatically (US Soccer standard)
              setNewTeam((f) => ({ ...f, ageGroup: age, format: formatForAge(age) ?? f.format }));
            }}
          />
          <select value={newTeam.format} onChange={(e) => setNewTeam((f) => ({ ...f, format: e.target.value }))}>
            {["4v4", "7v7", "9v9", "11v11"].map((f) => <option key={f}>{f}</option>)}
          </select>
          <button className="btn" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => void create()}>Create</button>
          <button className="btn ghost" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => setCreating(false)}>✕</button>
        </span>
      )}
    </span>
  );
}

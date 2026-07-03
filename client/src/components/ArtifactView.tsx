import { useState } from "react";
import { getJSON } from "../api";
import { FormationPitch } from "./FormationPitch";
import { SessionPlanView } from "./SessionPlanView";
import type { FormationAnalysis, GamePlan, SeasonEntry, SessionPlan } from "../types";

// The repository reader: reopen any saved artifact — a session plan with its
// diagrams, a game plan, a formation analysis — exactly as it was generated.
// Everything the coach builds is stored in the season record; this is how
// they get it back.

function isSessionPlan(p: unknown): p is SessionPlan {
  return !!p && typeof p === "object" && Array.isArray((p as SessionPlan).drills);
}
function isFormation(p: unknown): p is FormationAnalysis {
  return !!p && typeof p === "object" && Array.isArray((p as FormationAnalysis).positions);
}
function isGamePlan(p: unknown): p is GamePlan {
  return !!p && typeof p === "object" && Array.isArray((p as GamePlan).keysToTheGame);
}

export function ArtifactBody({ payload }: { payload: unknown }) {
  if (isSessionPlan(payload)) return <SessionPlanView plan={payload} />;
  if (isFormation(payload)) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>{payload.recommendedFormation}</h3>
        <p className="muted small">{payload.formationRationale}</p>
        <FormationPitch positions={payload.positions} />
      </div>
    );
  }
  if (isGamePlan(payload)) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>{payload.matchTitle}</h3>
        <b className="small">Keys to the game</b>
        <ul className="points">{payload.keysToTheGame.map((k, i) => <li key={i}>{k}</li>)}</ul>
        <b className="small">First ten minutes</b>
        <ul className="points">{payload.firstTenMinutes.map((k, i) => <li key={i}>{k}</li>)}</ul>
        <b className="small">The talk</b>
        <p className="small" style={{ fontStyle: "italic" }}>“{payload.pregameTalk}”</p>
      </div>
    );
  }
  return <p className="muted small">This entry has no reopenable artifact — the summary above is the record.</p>;
}

// Expandable row wrapper: fetches the full entry on first open.
export function ArtifactRow({ entry, children }: { entry: SeasonEntry; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (payload === undefined && entry.hasArtifact) {
      setLoading(true);
      try {
        const r = await getJSON<{ entry: SeasonEntry }>(`/api/season/${entry.id}`);
        setPayload(r.entry.payload ?? null);
      } catch {
        setPayload(null);
      }
      setLoading(false);
    }
  }

  return (
    <div>
      <div
        className="season-row"
        role={entry.hasArtifact ? "button" : undefined}
        style={entry.hasArtifact ? { cursor: "pointer" } : undefined}
        onClick={entry.hasArtifact ? () => void toggle() : undefined}
        title={entry.hasArtifact ? "Open the full saved version" : undefined}
      >
        {children}
        {entry.hasArtifact && <span className="muted small" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{open ? "▾ close" : "▸ open"}</span>}
      </div>
      {open && (
        <div className="card" style={{ margin: "4px 0 12px", padding: 14 }}>
          {loading ? <p className="muted small">Opening…</p> : <ArtifactBody payload={payload} />}
        </div>
      )}
    </div>
  );
}

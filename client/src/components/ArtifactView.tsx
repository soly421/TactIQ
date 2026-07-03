import { useState } from "react";
import { getJSON, sendJSON } from "../api";
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

interface StaffDebatePayload {
  staffDebate: true;
  question: string;
  a: { name: string; emoji: string; tagline: string; text: string };
  b: { name: string; emoji: string; tagline: string; text: string };
  verdict: string;
}
function isStaffDebate(p: unknown): p is StaffDebatePayload {
  return !!p && typeof p === "object" && (p as StaffDebatePayload).staffDebate === true;
}

export function ArtifactBody({ payload }: { payload: unknown }) {
  if (isSessionPlan(payload)) return <SessionPlanView plan={payload} />;
  if (isStaffDebate(payload)) {
    return (
      <div>
        <p className="small" style={{ fontWeight: 700 }}>The coach asked the staff: “{payload.question}”</p>
        {[payload.a, payload.b].map((v, i) => (
          <div key={i} className="card" style={{ margin: "8px 0", borderTop: "3px solid var(--gold)" }}>
            <div className="small" style={{ fontWeight: 800 }}>{v.emoji} {v.name} <span className="muted" style={{ fontWeight: 400 }}>— {v.tagline}</span></div>
            <p className="small" style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{v.text}</p>
          </div>
        ))}
        <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="small" style={{ fontWeight: 800 }}>🧡 Coach Sam — the verdict</div>
          <p className="small" style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{payload.verdict}</p>
        </div>
      </div>
    );
  }
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

// Expandable row wrapper: fetches the full entry on first open. Pass onDeleted
// to offer removal — a two-tap confirm, no browser dialogs.
export function ArtifactRow({ entry, children, onDeleted }: { entry: SeasonEntry; children: React.ReactNode; onDeleted?: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 3500); return; }
    try {
      await sendJSON(`/api/season/${entry.id}`, {}, "DELETE");
      onDeleted?.(entry.id);
    } catch { setConfirming(false); }
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
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          {entry.hasArtifact && <span className="muted small">{open ? "▾ close" : "▸ open"}</span>}
          {onDeleted && (
            <button
              className="tab"
              style={{ padding: "2px 8px", fontSize: 12, ...(confirming ? { borderColor: "var(--red, #c0392b)", color: "var(--red, #c0392b)" } : {}) }}
              title={confirming ? "This also removes it from the AI's season memory" : "Delete from your repository"}
              onClick={(e) => void remove(e)}
            >
              {confirming ? "Really delete?" : "🗑"}
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="card" style={{ margin: "4px 0 12px", padding: 14 }}>
          {loading ? <p className="muted small">Opening…</p> : <ArtifactBody payload={payload} />}
        </div>
      )}
    </div>
  );
}

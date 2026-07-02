import { useState } from "react";
import { sendJSON } from "../api";
import { useGamify } from "./Gamify";
import type { AwardResult } from "../types";

// Thumbs up/down on any AI output. Every rating earns XP and feeds the
// quality-eval dataset.
export function RateBar({ kind, entryId, compact }: { kind: string; entryId?: number; compact?: boolean }) {
  const { celebrate } = useGamify();
  const [vote, setVote] = useState<1 | -1 | 0>(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  async function submit(v: 1 | -1, withNote?: string) {
    try {
      const r = await sendJSON<{ award: AwardResult }>("/api/feedback", { kind, entryId, vote: v, note: withNote });
      setVote(v);
      if (v === -1 && !withNote) {
        setNoteOpen(true);
      } else {
        setDone(true);
        setNoteOpen(false);
      }
      celebrate(r.award);
    } catch {
      // rating is best-effort
    }
  }

  return (
    <div className={`rate-bar no-print ${compact ? "compact" : ""}`}>
      {!compact && <span className="label">Rate this:</span>}
      <button className={`rate-btn ${vote === 1 ? "chosen-up" : ""}`} disabled={vote !== 0} onClick={() => void submit(1)} title="Good output">
        👍
      </button>
      <button className={`rate-btn ${vote === -1 ? "chosen-down" : ""}`} disabled={vote !== 0 && !noteOpen} onClick={() => vote === 0 && void submit(-1)} title="Not useful">
        👎
      </button>
      {noteOpen && !done && (
        <span className="rate-note">
          <input
            value={note}
            placeholder="What was off? (optional — helps TactIQ improve)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setDone(true);
                setNoteOpen(false);
                if (note.trim()) void sendJSON("/api/feedback", { kind: `${kind}-note`, entryId, vote: -1, note });
              }
            }}
          />
        </span>
      )}
      {done && <span className="rate-thanks">Thanks, coach — logged ✓</span>}
    </div>
  );
}

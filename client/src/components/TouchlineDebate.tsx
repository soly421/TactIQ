import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { useGamify } from "./Gamify";
import type { AwardResult } from "../types";

interface DebateData {
  debate: { id: string; scenario: string; options: { id: string; label: string }[] };
  yourVote: string | null;
  totals: Record<string, number>;
  voteCount: number;
  verdict: string | null;
  verdictAt: string;
}

// The Touchline Debate: one dilemma a week, tap to vote, see the split,
// verdict drops Saturday. Structured voting = social with zero moderation.
export function TouchlineDebate() {
  const { celebrate } = useGamify();
  const [d, setD] = useState<DebateData | null>(null);
  useEffect(() => {
    void getJSON<DebateData>("/api/debate").then(setD).catch(() => {});
  }, []);
  if (!d) return null;
  const total = Math.max(1, d.voteCount);

  async function vote(choice: string) {
    // first vote earns +10 XP — the toast/confetti must actually fire
    const r = await sendJSON<DebateData & { award: AwardResult | null }>("/api/debate/vote", { choice });
    setD(r);
    if (r.award) celebrate(r.award);
  }

  return (
    <div className="card debate-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ marginTop: 0 }}>🗣️ Touchline Debate</h2>
        <span className="muted small">{d.voteCount} vote{d.voteCount === 1 ? "" : "s"}</span>
      </div>
      <p className="debate-q">{d.debate.scenario}</p>
      {d.debate.options.map((o) => {
        const n = d.totals[o.id] ?? 0;
        const pct = Math.round((n / total) * 100);
        const mine = d.yourVote === o.id;
        return d.yourVote ? (
          <div key={o.id} className={`debate-result ${mine ? "mine" : ""}`}>
            <div className="dr-bar" style={{ width: `${Math.max(4, pct)}%` }} />
            <span className="dr-label">{mine ? "✓ " : ""}{o.label}</span>
            <span className="dr-pct">{pct}%</span>
          </div>
        ) : (
          <button key={o.id} className="suggestion" style={{ width: "100%", textAlign: "left", marginBottom: 6 }} onClick={() => void vote(o.id)}>
            {o.label}
          </button>
        );
      })}
      {d.yourVote && (
        d.verdict ? (
          <div className="debate-verdict">
            <b>🧡 Coach Sam's verdict:</b> {d.verdict}
          </div>
        ) : (
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            🧡 Coach Sam's verdict drops <b>Saturday</b> — new debate every Monday. Voting earns +10 XP.
          </p>
        )
      )}
    </div>
  );
}


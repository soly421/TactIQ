import { PitchDiagram } from "./PitchDiagram";
import { RateBar } from "./RateBar";
import type { SessionPlan } from "../types";

export function SessionPlanView({ plan, entryId }: { plan: SessionPlan; entryId?: number }) {
  const isDemo = /\(demo/i.test(plan.title);
  return (
    <div className="fade-in">
      {isDemo && (
        <p className="small" style={{ color: "var(--gold)", margin: "0 0 10px" }}>
          🧪 Demo sample — the drills and diagrams below are one fixed example, not built for your request. Add the engine key to generate for real.
        </p>
      )}
      <div className="hero" style={{ paddingBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24 }}>{plan.title}</h1>
          <button className="btn ghost no-print" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          {plan.ageGroup} · {plan.durationMinutes} min · {plan.theme}
        </p>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>🎯 Objectives</h3>
          <ul className="points">{plan.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
        <div className="card">
          <h3>🎒 Equipment</h3>
          <ul className="points">{plan.equipment.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      </div>

      {plan.drills.map((d, i) => (
        <div key={i} className="card drill">
          <div className="drill-head">
            <div>
              <span className="phase-tag">{d.phase.replace(/-/g, " ")}</span>
              <h3 style={{ margin: "2px 0 4px" }}>
                {i + 1}. {d.name}
              </h3>
            </div>
            <span className="chip">{d.durationMinutes} min · {d.area}</span>
          </div>
          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <PitchDiagram diagram={d.diagram} />
            <div>
              <p className="small" style={{ lineHeight: 1.6 }}>{d.organization}</p>
              <h3 style={{ color: "var(--accent)", fontSize: 14 }}>Coaching points</h3>
              <ul className="points">{d.coachingPoints.map((c, j) => <li key={j}>{c}</li>)}</ul>
              {d.progressions.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14 }}>Progressions</h3>
                  <ul className="points">{d.progressions.map((c, j) => <li key={j}>{c}</li>)}</ul>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="card">
        <h3>🧠 Coach reminders</h3>
        <ul className="points">{plan.coachReminders.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <RateBar kind="session" entryId={entryId} />
      </div>
          <div className="notation-legend card">
        <b className="small">Diagram key (standard notation)</b>
        <div className="legend-row">
          <span><svg width="34" height="10"><line x1="2" y1="5" x2="26" y2="5" stroke="#ffe14d" strokeWidth="2"/><polygon points="26,1 33,5 26,9" fill="#ffe14d"/></svg> Pass</span>
          <span><svg width="34" height="10"><line x1="2" y1="5" x2="26" y2="5" stroke="#fff" strokeWidth="2" strokeDasharray="4 3"/><polygon points="26,1 33,5 26,9" fill="#fff"/></svg> Run (no ball)</span>
          <span><svg width="34" height="10"><path d="M2 5 Q 8 0, 14 5 T 26 5" fill="none" stroke="#7ef0ff" strokeWidth="2"/><polygon points="26,1 33,5 26,9" fill="#7ef0ff"/></svg> Dribble</span>
          <span>🔶 Attacker</span>
          <span>🔷 Defender</span>
          <span>⚪ Neutral</span>
          <span>▲ Cone</span>
          <span>⚽ Ball</span>
          <span>🥅 Goal</span>
        </div>
      </div>
</div>
  );
}

import { FormationPitch } from "./FormationPitch";
import { RateBar } from "./RateBar";
import type { FormationAnalysis } from "../types";

// The full AI game-model report: shape, phases, strengths, vulnerabilities,
// training priorities. Generated from the Tactics Board's current context.
export function FormationAnalysisView({ analysis, entryId }: { analysis: FormationAnalysis; entryId?: number }) {
  return (
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
  );
}

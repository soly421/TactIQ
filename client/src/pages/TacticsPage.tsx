import { useState } from "react";
import { FieldBoard } from "./FieldBoard";
import { FormationExplorer } from "./FormationExplorer";

// The Tactics Board, promoted to a first-class destination: the tactical
// painter (describe a situation, get the picture, ball route and callouts)
// with the freehand drill sketchpad one chip away.
export function TacticsPage() {
  const [mode, setMode] = useState<"formations" | "freehand">("formations");
  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1>Tactics Board</h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={`tab ${mode === "formations" ? "active" : ""}`} onClick={() => setMode("formations")}>♟️ Formations & scenarios</button>
          <button className={`tab ${mode === "freehand" ? "active" : ""}`} onClick={() => setMode("freehand")} title="Blank pitch — place players, cones and arrows freehand">🎨 Freehand sketch</button>
        </div>
      </div>
      <p className="sub">
        Pick your formation, put the opposition on the pitch, then describe the situation in your own words — the engine paints
        the answer: where everyone stands, where the ball should travel, and what to shout from the touchline.
      </p>
      {mode === "formations" ? <FormationExplorer /> : <FieldBoard />}
    </div>
  );
}

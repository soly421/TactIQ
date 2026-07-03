import { useState } from "react";
import { FieldBoard } from "./FieldBoard";
import { FormationExplorer } from "./FormationExplorer";

// The Tactics Board, promoted to a first-class destination: the formation
// board (scenarios, playback, chess-mode engine reads, opposition) with the
// freehand drill sketchpad one chip away.
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
        Every formation, every scenario, animated — then move a player like a chess piece and the engine tells you what you gained
        and what you gave away. Put the opposition on the pitch and every read answers against them.
      </p>
      {mode === "formations" ? <FormationExplorer /> : <FieldBoard />}
    </div>
  );
}

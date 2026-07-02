import { useState } from "react";
import { SessionStudio } from "./SessionStudio";
import { FormationLab } from "./FormationLab";
import { Playbook } from "./Playbook";

const SEGMENTS = [
  { id: "sessions", label: "📋 Sessions" },
  { id: "formations", label: "🔷 Formations" },
  { id: "playbook", label: "💡 Playbook" },
];

// The Labs: session design, formation analysis, and guided tactical advice.
export function Studio() {
  const [seg, setSeg] = useState("sessions");

  return (
    <div className="fade-in">
      <h1>The Labs</h1>
      <p className="sub">Customized outputs, visualized: training sessions with animated diagrams, formation game models, and structured tactical guidance.</p>
      <div className="tabs" style={{ marginBottom: 18, maxWidth: 480 }}>
        {SEGMENTS.map((s) => (
          <button key={s.id} className={`tab ${seg === s.id ? "active" : ""}`} onClick={() => setSeg(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {seg === "sessions" && <SessionStudio />}
      {seg === "formations" && <FormationLab />}
      {seg === "playbook" && <Playbook />}
    </div>
  );
}

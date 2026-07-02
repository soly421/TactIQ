import { useState } from "react";
import { GamifyProvider, useGamify } from "./components/Gamify";
import { Dashboard } from "./pages/Dashboard";
import { Advisors } from "./pages/Advisors";
import { SessionStudio } from "./pages/SessionStudio";
import { FormationLab } from "./pages/FormationLab";
import { Playbook } from "./pages/Playbook";
import { Team } from "./pages/Team";
import { Community } from "./pages/Community";

const TABS = [
  { id: "home", label: "Home" },
  { id: "advisors", label: "Advisors" },
  { id: "sessions", label: "Sessions" },
  { id: "formations", label: "Formations" },
  { id: "playbook", label: "Playbook" },
  { id: "team", label: "My Team" },
  { id: "community", label: "Community" },
];

function Header() {
  const { progress } = useGamify();
  return (
    <div className="header">
      <div className="logo">
        <span className="ball">⚽</span>
        Tact<span className="iq">IQ</span>
      </div>
      <div className="header-stats">
        {progress && (
          <>
            <span className="chip">
              <span className="flame">🔥</span> {progress.streak}
            </span>
            <span className="chip">⚡ {progress.xp.toLocaleString()} XP</span>
            <span className="chip quota">
              <b>{progress.usage.limit - progress.usage.used}</b>/{progress.usage.limit} msgs
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState("home");

  return (
    <div className="shell">
      <Header />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "home" && <Dashboard go={setTab} />}
      {tab === "advisors" && <Advisors />}
      {tab === "sessions" && <SessionStudio />}
      {tab === "formations" && <FormationLab />}
      {tab === "playbook" && <Playbook />}
      {tab === "team" && <Team />}
      {tab === "community" && <Community />}
    </div>
  );
}

export default function App() {
  return (
    <GamifyProvider>
      <Shell />
    </GamifyProvider>
  );
}

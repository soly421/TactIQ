import { useEffect, useState } from "react";
import { GamifyProvider, useGamify } from "./components/Gamify";
import { getJSON, sendJSON } from "./api";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Advisors } from "./pages/Advisors";
import { Library } from "./pages/Library";
import { Studio } from "./pages/Studio";
import { MatchDay } from "./pages/MatchDay";
import { Team } from "./pages/Team";
import { Community } from "./pages/Community";
import type { Settings } from "./types";

const TABS = [
  { id: "home", label: "Home" },
  { id: "chat", label: "Chat" },
  { id: "advisors", label: "Advisors" },
  { id: "library", label: "Library" },
  { id: "studio", label: "Labs" },
  { id: "matchday", label: "Match Day" },
  { id: "team", label: "My Team" },
  { id: "community", label: "Community" },
];

function Header() {
  const { progress, refresh } = useGamify();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getJSON<Settings>("/api/settings").then(setSettings).catch(() => {});
  }, [progress?.plan]);

  async function togglePlan() {
    if (!settings) return;
    const next = settings.plan === "free" ? "pro" : "free";
    const updated = await sendJSON<Settings>("/api/settings/plan", { plan: next }, "PUT");
    setSettings(updated);
    void refresh();
  }

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
            <span className="chip quota">
              <b>{Math.max(0, progress.usage.limit - progress.usage.used)}</b>/{progress.usage.limit}
            </span>
          </>
        )}
        {settings && (
          <button
            className={`chip plan-chip ${settings.plan}`}
            title={`Chat: ${settings.chatModel} · Visualizations: ${settings.structuredModel}. Click to switch plan.`}
            onClick={() => void togglePlan()}
          >
            {settings.plan === "pro" ? "👑 PRO" : "FREE"}
          </button>
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
      {tab === "chat" && <Chat />}
      {tab === "advisors" && <Advisors />}
      {tab === "library" && <Library />}
      {tab === "studio" && <Studio />}
      {tab === "matchday" && <MatchDay />}
      {tab === "team" && <Team />}
      {tab === "community" && <Community />}

      {tab !== "chat" && (
        <button className="fab" title="Ask Coach T" onClick={() => setTab("chat")}>
          💬
        </button>
      )}
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

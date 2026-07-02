import { useCallback, useEffect, useState } from "react";
import { GamifyProvider, useGamify } from "./components/Gamify";
import { getJSON, getToken, sendJSON, setToken } from "./api";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Advisors } from "./pages/Advisors";
import { Library } from "./pages/Library";
import { Studio } from "./pages/Studio";
import { MatchDay } from "./pages/MatchDay";
import { FilmRoom } from "./pages/FilmRoom";
import { Team } from "./pages/Team";
import { Club } from "./pages/Club";
import { Community } from "./pages/Community";
import { Privacy } from "./pages/Privacy";
import { Pricing } from "./pages/Pricing";
import type { Settings, User } from "./types";

const NAV = [
  { id: "home", label: "Home", emoji: "🏠" },
  { id: "chat", label: "Ask Coach Sam", emoji: "💬" },
  { id: "advisors", label: "Advisors", emoji: "🧠" },
  { id: "library", label: "Library", emoji: "📚" },
  { id: "studio", label: "The Labs", emoji: "🔬" },
  { id: "matchday", label: "Match Day", emoji: "📣" },
  { id: "film", label: "Film Room", emoji: "🎬" },
  { id: "team", label: "My Team", emoji: "🛡️" },
  { id: "club", label: "Club", emoji: "🏛️" },
  { id: "community", label: "Community", emoji: "🏆" },
];

function TopBar() {
  const { progress, refresh } = useGamify();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getJSON<Settings>("/api/settings").then(setSettings).catch(() => {});
  }, [progress?.plan]);

  // Returning from Stripe checkout: the webhook flips the plan server-side —
  // poll settings a few times so the chip flips to PRO without a manual reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("billing")) return;
    const wasSuccess = params.get("billing") === "success";
    window.history.replaceState({}, "", window.location.pathname);
    if (!wasSuccess) return;
    let tries = 0;
    const poll = setInterval(() => {
      tries += 1;
      void getJSON<Settings>("/api/settings").then((s) => {
        setSettings(s);
        if (s.plan === "pro" || tries >= 10) clearInterval(poll);
      });
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  // With Stripe configured the chip starts checkout (free) or opens the
  // customer portal (pro). Without it, it stays the local dev toggle.
  async function planAction() {
    if (!settings) return;
    if (settings.billingConfigured) {
      if (settings.plan === "free") {
        window.dispatchEvent(new Event("tactiq:pricing")); // funnel through the plans page (annual upsell)
        return;
      }
      const r = await sendJSON<{ url: string }>("/api/billing/portal", {});
      if (r.url) window.location.href = r.url;
      return;
    }
    const next = settings.plan === "free" ? "pro" : "free";
    const updated = await sendJSON<Settings>("/api/settings/plan", { plan: next }, "PUT");
    setSettings(updated);
    void refresh();
  }

  const engineTitle = settings?.engines
    ? `Chat: ${settings.engines.chat.label} (${settings.engines.chat.model}) · Visualizations: ${settings.engines.structured.label} (${settings.engines.structured.model})`
    : "";

  return (
    <div className="topbar no-print">
      {progress && (
        <>
          <span className="chip"><span className="flame">🔥</span> {progress.streak}</span>
          <span className="chip">⚡ {progress.xp.toLocaleString()} XP</span>
          <span className="chip quota"><b>{Math.max(0, progress.usage.limit - progress.usage.used)}</b>/{progress.usage.limit} msgs</span>
        </>
      )}
      {settings?.engines && (
        <span className="chip" title={engineTitle}>
          {settings.plan === "pro" ? "🧠" : "⚡"} {settings.engines.chat.label}
        </span>
      )}
      {settings && (
        <button
          className={`chip plan-chip ${settings.plan}`}
          title={
            settings.billingConfigured
              ? settings.plan === "free"
                ? "Upgrade to Pro — Deep Tactical engine on every output"
                : "Manage your subscription"
              : `${engineTitle} Click to switch plan (dev mode).`
          }
          onClick={() => void planAction()}
        >
          {settings.plan === "pro" ? "👑 PRO" : settings.billingConfigured ? "⬆️ Upgrade" : "FREE"}
        </button>
      )}
    </div>
  );
}

function Shell({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [tab, setTab] = useState("home");
  const [live, setLive] = useState(true);

  useEffect(() => {
    void getJSON<{ live: boolean }>("/api/health").then((h) => setLive(h.live)).catch(() => {});
    const openPricing = () => setTab("pricing");
    window.addEventListener("tactiq:pricing", openPricing);
    return () => window.removeEventListener("tactiq:pricing", openPricing);
  }, []);

  return (
    <div className="layout">
      <nav className="sidebar no-print">
        <div className="logo">⚽ <span>Tact<span className="iq">IQ</span></span></div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
            <span className="ni-emoji">{n.emoji}</span> {n.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="user-box">
          <div className="uname">{user.name}</div>
          <div className="muted small">{user.club ? user.club.name : "Independent coach"}</div>
          <button className="signout" onClick={() => setTab("privacy")} style={{ marginBottom: 4 }}>Privacy & player data</button>
          <button className="signout" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <main className="content">
        <TopBar />
        {!live && (
          <div className="demo-banner no-print">
            🧪 <b>Demo mode</b> — no <code>ANTHROPIC_API_KEY</code> is set on the server, so all outputs are canned samples and will NOT match your inputs.
            Add the key and restart to generate for your actual team.
          </div>
        )}
        {tab === "home" && <Dashboard go={setTab} />}
        {tab === "chat" && <Chat />}
        {tab === "advisors" && <Advisors />}
        {tab === "library" && <Library />}
        {tab === "studio" && <Studio />}
        {tab === "matchday" && <MatchDay />}
        {tab === "film" && <FilmRoom />}
        {tab === "team" && <Team />}
        {tab === "club" && <Club user={user} />}
        {tab === "community" && <Community />}
        {tab === "privacy" && <Privacy />}
        {tab === "pricing" && <Pricing go={setTab} />}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener("tactiq:signout", signOut);
    if (getToken()) {
      getJSON<{ user: User }>("/api/auth/me")
        .then((r) => setUser(r.user))
        .catch(() => setToken(null))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
    return () => window.removeEventListener("tactiq:signout", signOut);
  }, [signOut]);

  if (checking) {
    return (
      <div className="auth-wrap">
        <span className="spinner" />
      </div>
    );
  }
  if (!user) return <Auth onAuthed={setUser} />;

  return (
    <GamifyProvider>
      <Shell user={user} onSignOut={signOut} />
    </GamifyProvider>
  );
}

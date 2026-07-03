import { useEffect, useState } from "react";
import { getJSON, sendJSON, setToken } from "../api";
import { PitchDiagram } from "../components/PitchDiagram";
import type { SessionPlan, User } from "../types";

// Try-before-signup: the magic moment happens on this page, account second.
function TryItFirst() {
  const [form, setForm] = useState({ ageGroup: "U10", theme: "Pressing & winning the ball back" });
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);

  // This page sits outside the app shell, so it needs its own demo tell —
  // a prospect must never mistake a canned sample for a generated session.
  useEffect(() => {
    void getJSON<{ live: boolean }>("/api/health").then((h) => setLive(h.live)).catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await sendJSON<{ plan: SessionPlan }>("/api/try/session", form);
      setPlan(r.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again");
    }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>⚡ Try it before you sign up</h3>
      <p className="muted small">Pick an age group and a theme — get a real animated session in seconds.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={form.ageGroup} onChange={(e) => setForm((f) => ({ ...f, ageGroup: e.target.value }))}>
          {["U8", "U10", "U12", "U14", "U16", "HS"].map((a) => <option key={a}>{a}</option>)}
        </select>
        <input
          style={{ flex: 1, minWidth: 160 }}
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
          placeholder="e.g. finishing, 1v1s, playing out of the back…"
        />
        <button className="btn" onClick={() => void generate()} disabled={busy}>
          {busy ? "Designing…" : "Generate"}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {plan && !live && (
        <p className="small" style={{ margin: "10px 0 0", color: "var(--gold)" }}>
          🧪 Demo server — this is a sample session, not one generated for your inputs.
        </p>
      )}
      {plan && (
        <div className="fade-in" style={{ marginTop: 14 }}>
          <h3 style={{ marginBottom: 4 }}>{plan.title}</h3>
          <p className="muted small">{plan.ageGroup} · {plan.durationMinutes} min · {plan.theme}</p>
          {plan.drills.slice(0, 2).map((d, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <b>{d.name}</b> <span className="muted small">({d.durationMinutes} min)</span>
              <p className="small" style={{ margin: "4px 0" }}>{d.organization}</p>
              {d.diagram && <PitchDiagram diagram={d.diagram} />}
            </div>
          ))}
          <p className="small" style={{ fontWeight: 600, color: "var(--accent)" }}>
            + {Math.max(0, plan.drills.length - 2)} more exercises, coaching points, and progressions — create your free account to see the full session, save it, and build your team's memory.
          </p>
        </div>
      )}
    </div>
  );
}

export function Auth({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("register");
  const [form, setForm] = useState({ name: "", email: "", password: "", clubChoice: "none", clubCode: "", clubName: "" });
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Arriving from a password-reset email link (?reset=TOKEN)
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reset");
    if (token) {
      setResetToken(token);
      setMode("reset");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function submit() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const r = await sendJSON<{ message: string }>("/api/auth/forgot", { email: form.email });
        setNotice(r.message);
      } else if (mode === "reset") {
        const r = await sendJSON<{ token: string }>("/api/auth/reset", { token: resetToken, password: form.password });
        setToken(r.token);
        const me = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${r.token}` } }).then((x) => x.json());
        onAuthed(me.user);
      } else {
        const body =
          mode === "login"
            ? { email: form.email, password: form.password }
            : {
                name: form.name,
                email: form.email,
                password: form.password,
                clubCode: form.clubChoice === "join" ? form.clubCode : undefined,
                clubName: form.clubChoice === "create" ? form.clubName : undefined,
              };
        const r = await sendJSON<{ token: string; user: User }>(`/api/auth/${mode}`, body);
        setToken(r.token);
        onAuthed(r.user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo">⚽ <span>Tact<span className="iq">IQ</span></span></div>
        <p className="auth-tagline">Your AI assistant coach for youth soccer</p>
        <div className="card">
          {(mode === "login" || mode === "register") && (
            <div className="tabs" style={{ width: "100%", justifyContent: "center" }}>
              <button className={`tab ${mode === "register" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setMode("register")}>Create account</button>
              <button className={`tab ${mode === "login" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setMode("login")}>Sign in</button>
            </div>
          )}
          {mode === "forgot" && <h3 style={{ marginTop: 0 }}>Reset your password</h3>}
          {mode === "reset" && <h3 style={{ marginTop: 0 }}>Choose a new password</h3>}

          {mode === "register" && (
            <label className="field" style={{ marginBottom: 12 }}>
              Your name
              <input value={form.name} placeholder="Coach Sam" onChange={(e) => set("name", e.target.value)} />
            </label>
          )}
          {mode !== "reset" && (
            <label className="field" style={{ marginBottom: 12 }}>
              Email
              <input type="email" value={form.email} placeholder="you@club.org" onChange={(e) => set("email", e.target.value)} />
            </label>
          )}
          {mode !== "forgot" && (
            <label className="field" style={{ marginBottom: 12 }}>
              {mode === "reset" ? "New password (8+ characters)" : "Password"} {mode === "register" && <span style={{ fontWeight: 400 }}>(8+ characters)</span>}
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </label>
          )}

          {mode === "register" && (
            <>
              <label className="field" style={{ marginBottom: 12 }}>
                Club
                <select value={form.clubChoice} onChange={(e) => set("clubChoice", e.target.value)}>
                  <option value="none">No club (just me)</option>
                  <option value="join">Join a club with a code</option>
                  <option value="create">Create a club (I'm the DOC/admin)</option>
                </select>
              </label>
              {form.clubChoice === "join" && (
                <label className="field" style={{ marginBottom: 12 }}>
                  Club code
                  <input value={form.clubCode} placeholder="e.g. RIVER421" onChange={(e) => set("clubCode", e.target.value)} />
                </label>
              )}
              {form.clubChoice === "create" && (
                <label className="field" style={{ marginBottom: 12 }}>
                  Club name
                  <input value={form.clubName} placeholder="e.g. Riverside SC" onChange={(e) => set("clubName", e.target.value)} />
                </label>
              )}
            </>
          )}

          <button className="btn" style={{ width: "100%", marginTop: 4 }} onClick={() => void submit()} disabled={busy}>
            {busy ? "One moment…" : mode === "register" ? "Start coaching →" : mode === "login" ? "Sign in →" : mode === "forgot" ? "Send reset link →" : "Set new password →"}
          </button>
          {mode === "login" && (
            <button className="tab" style={{ marginTop: 8 }} onClick={() => setMode("forgot")}>Forgot password?</button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button className="tab" style={{ marginTop: 8 }} onClick={() => setMode("login")}>← Back to sign in</button>
          )}
          {error && <div className="error-box">{error}</div>}
          {notice && <p style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{notice}</p>}
          <p className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>
            Your team data stays private to your account. Player entries should use <b>first names or initials only</b> — TactIQ is built to work without any personal details about minors. Delete your account and all data anytime in My Team.
          </p>
        </div>
        {mode === "register" && <TryItFirst />}
      </div>
    </div>
  );
}

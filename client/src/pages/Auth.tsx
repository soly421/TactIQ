import { useState } from "react";
import { sendJSON, setToken } from "../api";
import type { User } from "../types";

export function Auth({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ name: "", email: "", password: "", clubChoice: "none", clubCode: "", clubName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError("");
    setBusy(true);
    try {
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
          <div className="tabs" style={{ width: "100%", justifyContent: "center" }}>
            <button className={`tab ${mode === "register" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setMode("register")}>Create account</button>
            <button className={`tab ${mode === "login" ? "active" : ""}`} style={{ flex: 1 }} onClick={() => setMode("login")}>Sign in</button>
          </div>

          {mode === "register" && (
            <label className="field" style={{ marginBottom: 12 }}>
              Your name
              <input value={form.name} placeholder="Coach Sam" onChange={(e) => set("name", e.target.value)} />
            </label>
          )}
          <label className="field" style={{ marginBottom: 12 }}>
            Email
            <input type="email" value={form.email} placeholder="you@club.org" onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 12 }}>
            Password {mode === "register" && <span style={{ fontWeight: 400 }}>(8+ characters)</span>}
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>

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
                  <input value={form.clubCode} placeholder="e.g. LMSC421" onChange={(e) => set("clubCode", e.target.value)} />
                </label>
              )}
              {form.clubChoice === "create" && (
                <label className="field" style={{ marginBottom: 12 }}>
                  Club name
                  <input value={form.clubName} placeholder="e.g. Lower Merion SC" onChange={(e) => set("clubName", e.target.value)} />
                </label>
              )}
            </>
          )}

          <button className="btn" style={{ width: "100%", marginTop: 4 }} onClick={() => void submit()} disabled={busy}>
            {busy ? "One moment…" : mode === "register" ? "Start coaching →" : "Sign in →"}
          </button>
          {error && <div className="error-box">{error}</div>}
          <p className="muted small" style={{ marginTop: 12, lineHeight: 1.5 }}>
            Your team data stays private to your account. Please use first names or initials only for players. You can delete your account and all data anytime in My Team.
          </p>
        </div>
      </div>
    </div>
  );
}

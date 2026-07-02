import { useRef, useState } from "react";
import { SessionStudio } from "./SessionStudio";
import { FormationLab } from "./FormationLab";
import { Playbook } from "./Playbook";
import { FieldBoard } from "./FieldBoard";
import { savePlanOffline } from "../savedPlans";
import { goUpgrade, useEntitlements } from "../entitlements";
import { sendJSON } from "../api";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import type { AwardResult, SeasonPlan, SessionPlan } from "../types";

const SEGMENTS = [
  { id: "sessions", label: "📋 Sessions" },
  { id: "scan", label: "📷 Session Scan" },
  { id: "board", label: "🎯 Field Board" },
  { id: "formations", label: "🔷 Formations" },
  { id: "season", label: "🗓️ Season Plan" },
  { id: "playbook", label: "💡 Playbook" },
];

export function Studio() {
  const ent = useEntitlements();
  const [seg, setSeg] = useState("sessions");

  return (
    <div className="fade-in">
      <h1>The Labs</h1>
      <p className="sub">Where everything gets visual: design sessions, scan hand-drawn plans, animate tactics on the Field Board, build formations and season curricula.</p>
      <div className="tabs">
        {SEGMENTS.map((s) => (
          <button key={s.id} className={`tab ${seg === s.id ? "active" : ""}`} onClick={() => setSeg(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {seg === "sessions" && <SessionStudio />}
      {seg === "scan" && <SessionScan />}
      {seg === "board" && <FieldBoard />}
      {seg === "formations" && <FormationLab />}
      {seg === "season" && (ent === null || ent.seasonPlanner ? <SeasonPlanner /> : (
        <div className="pro-gate">
          <h3>📅 The Season Planner is a Pro feature</h3>
          <p>A periodized 8-16 week curriculum built for your team — coherent blocks, age-appropriate load, themes that connect training to weekend games.</p>
          <button className="btn" onClick={() => void goUpgrade(ent.billingConfigured)}>👑 Upgrade to Pro</button>
        </div>
      ))}
      {seg === "playbook" && <Playbook />}
    </div>
  );
}

// Photo of a hand-drawn session -> full digital animated session.
function SessionScan() {
  const { celebrate } = useGamify();
  const [image, setImage] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function scan() {
    if (!image) return;
    setError("");
    setLoading(true);
    setPlan(null);
    try {
      const r = await sendJSON<{ plan: SessionPlan; award: AwardResult }>("/api/session-scan", { image, notes });
      setPlan(r.plan);
      savePlanOffline(r.plan);
      celebrate(r.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>📷 Turn your sketch into a digital session</h3>
        <p className="muted small">Photograph a whiteboard, notebook page, or napkin sketch — TactIQ reads the drawings and rebuilds the whole session with animated diagrams and coaching points.</p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Choose photo</button>
          {image && <img src={image} alt="sketch" style={{ height: 72, borderRadius: 8, border: "1px solid var(--border)" }} />}
        </div>
        <label className="field" style={{ marginBottom: 14 }}>
          Anything the sketch doesn't show? (age group, duration, focus)
          <input value={notes} placeholder="e.g. U12 travel, 90 minutes" onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn" onClick={() => void scan()} disabled={!image || loading}>
          {loading ? "Reading your sketch…" : "⚡ Digitize Session"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>
      {loading && (
        <div className="gen-overlay"><span className="spinner" /><div>Reconstructing every drill from your drawing…</div></div>
      )}
      {plan && <SessionPlanView plan={plan} />}
    </div>
  );
}

// 8-16 week periodized curriculum.
function SeasonPlanner() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({ weeks: "12", practicesPerWeek: "2", gamesPerWeek: "1", focus: "" });
  const [plan, setPlan] = useState<SeasonPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    setError("");
    setLoading(true);
    setPlan(null);
    try {
      const r = await sendJSON<{ plan: SeasonPlan; award: AwardResult }>("/api/season-plan", {
        weeks: Number(form.weeks) || 12,
        practicesPerWeek: Number(form.practicesPerWeek) || 2,
        gamesPerWeek: Number(form.gamesPerWeek) || 1,
        focus: form.focus,
      });
      setPlan(r.plan);
      celebrate(r.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>🗓️ Periodized season curriculum</h3>
        <p className="muted small">A pro-style development plan for your whole season — blocks that build on each other, week themes, and game-day focus points. Uses your team profile.</p>
        <div className="form-grid">
          <label className="field">Weeks<input type="number" value={form.weeks} onChange={(e) => set("weeks", e.target.value)} /></label>
          <label className="field">Practices / week<input type="number" value={form.practicesPerWeek} onChange={(e) => set("practicesPerWeek", e.target.value)} /></label>
          <label className="field">Games / week<input type="number" value={form.gamesPerWeek} onChange={(e) => set("gamesPerWeek", e.target.value)} /></label>
        </div>
        <label className="field" style={{ marginBottom: 14 }}>
          Season focus
          <input value={form.focus} placeholder="e.g. Become a team that plays out from the back confidently" onChange={(e) => set("focus", e.target.value)} />
        </label>
        <button className="btn" onClick={() => void generate()} disabled={loading}>
          {loading ? "Building your season…" : "⚡ Build Season Plan"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>
      {loading && <div className="gen-overlay"><span className="spinner" /><div>Periodizing your season…</div></div>}
      {plan && (
        <div className="fade-in">
          <div className="hero">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 23 }}>{plan.title}</h1>
              <button className="btn ghost no-print" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
            </div>
            <ul className="points">{plan.principles.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div className="grid cols-2">
            {plan.weeks.map((w) => (
              <div key={w.week} className="card week-card">
                <span className="wk">Week {w.week} · {w.block}</span>
                <h3 style={{ margin: "4px 0 6px" }}>{w.theme}</h3>
                <ul className="points">{w.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
                <p className="small" style={{ margin: "6px 0 2px" }}><b>Sessions:</b> {w.sessionIdeas.join(" · ")}</p>
                <p className="small muted" style={{ margin: 0 }}><b>Game focus:</b> {w.gameFocus}</p>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>✅ Checkpoints — how you'll know it's working</h3>
            <ul className="points">{plan.checkpoints.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

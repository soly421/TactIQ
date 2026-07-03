import { useState } from "react";
import { sendJSON } from "../api";
import { formatForAge } from "../age";

// First-login onboarding: two short steps that earn their keep.
// Step 1 tells us who the coach is (role + biggest challenge tune every AI
// answer, referral tells us how they found us, club name + ZIP map territory,
// and a director gets the club-licensing hand-raise right in the flow).
// Step 2 creates the team — the thing that powers the whole product.
// Skippable, because a form should never beat a signup.

const ROLES = [
  { id: "head", label: "🧢 Head coach" },
  { id: "assistant", label: "🤝 Assistant coach" },
  { id: "parent", label: "🙋 Parent volunteer" },
  { id: "director", label: "🏛️ Club director (DOC)" },
  { id: "trainer", label: "⚽ Private trainer" },
];

const REFERRALS = [
  { id: "coach", label: "Another coach" },
  { id: "club", label: "My club" },
  { id: "social", label: "Social media" },
  { id: "search", label: "Search" },
  { id: "event", label: "Tournament / event" },
  { id: "other", label: "Other" },
];

const CLUB_SIZES = ["1-5", "6-15", "16-40", "40+"];

const CHALLENGES = [
  { id: "sessions", label: "🧭 Planning good sessions" },
  { id: "tactics", label: "♟️ In-game tactics" },
  { id: "development", label: "📈 Player development" },
  { id: "parents", label: "🗣️ Parents & playing time" },
];

const AGE_GROUPS = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17+", "HS"];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [coachRole, setCoachRole] = useState("");
  const [referral, setReferral] = useState("");
  const [zip, setZip] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubSize, setClubSize] = useState("");
  const [challenge, setChallenge] = useState("");
  const [ctaSent, setCtaSent] = useState(false);
  const [experience, setExperience] = useState("intermediate");
  const [teamName, setTeamName] = useState("");
  const [ageGroup, setAgeGroup] = useState("U10");
  const [level, setLevel] = useState("travel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const format = formatForAge(ageGroup) ?? "7v7";

  async function skip() {
    await sendJSON("/api/onboarding", { skipped: true }).catch(() => {});
    onDone();
  }

  // The director hand-raise is recorded immediately — it must survive a
  // skipped or abandoned wizard, because it's the hottest lead we can get.
  async function raiseHand() {
    setCtaSent(true);
    await sendJSON("/api/onboarding/club-interest", {}).catch(() => {});
  }

  async function finish() {
    if (!teamName.trim()) {
      setError("Give your team a name — it's how all your work gets organized.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON("/api/onboarding", { coachRole, referral, zip, clubName, clubSize, challenge, clubInterest: ctaSent });
      await sendJSON("/api/team", {
        teamName: teamName.trim(),
        ageGroup,
        format,
        level,
        coachExperience: experience,
        preferredStyle: "",
        rosterNotes: "",
        seasonGoals: "",
        players: [],
      }, "PUT");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — you can finish this later in My Team.");
      setBusy(false);
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: "40px auto" }}>
      <div className="hero" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>{step === 1 ? "Welcome, coach 👋" : "Set up your team"}</h1>
          <span className="muted small">step {step} of 2</span>
        </div>
        <p className="sub" style={{ margin: "6px 0 0" }}>
          {step === 1
            ? "Thirty seconds of context and every answer TactIQ ever gives you gets sharper."
            : "Your team is the memory — sessions, game plans, and advice all build on it."}
        </p>
      </div>

      {step === 1 && (
        <div className="card" style={{ marginTop: 14 }}>
          <b className="small">What's your role?</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
            {ROLES.map((r) => (
              <button key={r.id} className={`tab ${coachRole === r.id ? "active" : ""}`} onClick={() => setCoachRole(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          {coachRole === "director" && (
            <div className="card" style={{ marginBottom: 14, borderColor: "var(--gold, #c9a227)" }}>
              <b className="small">How many teams does your club run?</b>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 10px" }}>
                {CLUB_SIZES.map((s) => (
                  <button key={s} className={`tab ${clubSize === s ? "active" : ""}`} onClick={() => setClubSize(s)}>{s} teams</button>
                ))}
              </div>
              <p className="muted small" style={{ margin: "0 0 8px" }}>
                Clubs license TactIQ at <b>$14.99/coach/mo</b> (10+ seats) — every coach gets the flagship engine, and you get the
                DOC dashboard, club-wide philosophy, and one invoice.
              </p>
              {ctaSent ? (
                <p className="small" style={{ color: "var(--green)", fontWeight: 600, margin: 0 }}>✓ Got it — we'll reach out at your signup email to set up a walkthrough.</p>
              ) : (
                <button className="btn" style={{ fontSize: 13 }} onClick={() => void raiseHand()}>🏛️ Talk to us about licensing your club</button>
              )}
            </div>
          )}
          <b className="small">What's hardest for you right now?</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
            {CHALLENGES.map((c) => (
              <button key={c.id} className={`tab ${challenge === c.id ? "active" : ""}`} onClick={() => setChallenge(c.id)}>{c.label}</button>
            ))}
          </div>
          <b className="small">Coaching experience</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
            {[["new", "🌱 My first seasons"], ["intermediate", "📋 A few years in"], ["experienced", "🎓 Experienced / licensed"]].map(([id, label]) => (
              <button key={id} className={`tab ${experience === id ? "active" : ""}`} onClick={() => setExperience(id)}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              Your club or organization <span className="muted">(optional)</span>
              <input value={clubName} maxLength={80} placeholder="e.g. Arlington Soccer Assoc." onChange={(e) => setClubName(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              How did you hear about TactIQ?
              <select value={referral} onChange={(e) => setReferral(e.target.value)}>
                <option value="">Choose…</option>
                {REFERRALS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 120 }}>
              ZIP <span className="muted">(optional)</span>
              <input value={zip} maxLength={5} placeholder="19003" onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, ""))} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button className="btn ghost" onClick={() => void skip()}>Skip for now</button>
            <button className="btn" onClick={() => setStep(2)}>Next: your team →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="form-grid">
            <label className="field">
              Team name
              <input value={teamName} placeholder="e.g. Thunder 2016 Orange" onChange={(e) => setTeamName(e.target.value)} />
            </label>
            <label className="field">
              Age group
              <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                {AGE_GROUPS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label className="field">
              Level
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="rec">Recreational</option>
                <option value="travel">Travel / Club</option>
                <option value="academy">Academy / Elite</option>
                <option value="hs">High School</option>
              </select>
            </label>
          </div>
          <p className="muted small">
            {ageGroup} plays <b>{format}</b> under US Soccer standards — the boards, sessions, and formations all follow automatically.
            Roster and schedule come later in My Team.
          </p>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
            <span style={{ display: "inline-flex", gap: 8 }}>
              <button className="btn ghost" onClick={() => void skip()}>Skip for now</button>
              <button className="btn" disabled={busy} onClick={() => void finish()}>
                {busy ? "Setting up…" : "🛡️ Create my team"}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import type { ClubComment, ClubOverview, ClubSession, User } from "../types";

interface ClubReportData {
  clubName: string;
  periodDays: number;
  license: { planTier: string; seats: number };
  coaches: { name: string; sessions: number; matchdays: number; conversations: number; film: number; ratings: number; lastActiveDay: string }[];
  totals: { sessions: number; matchdays: number; conversations: number; film: number; ratings: number };
}

// The DOC monthly report + club-license purchase: the artifact that justifies
// the invoice, and the button that pays it.
function ClubReport({ isAdmin, coachCount }: { isAdmin: boolean; coachCount: number }) {
  const [report, setReport] = useState<ClubReportData | null>(null);
  const [seats, setSeats] = useState(coachCount || 5);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<ClubReportData>("/api/club/report").then(setReport).catch(() => {});
  }, []);

  async function buyLicense() {
    setError("");
    try {
      const r = await sendJSON<{ url: string }>("/api/billing/club-checkout", { seats });
      if (r.url) window.location.href = r.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    }
  }

  if (!report) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>📈 Club report — last {report.periodDays} days</h2>
        <button className="btn ghost no-print" onClick={() => window.print()}>🖨 Print / PDF</button>
      </div>
      <p className="muted small">
        {report.license.planTier === "pro"
          ? `👑 Club license active: ${report.license.seats} Pro seats — every coach gets the Deep Tactical engine.`
          : "No club license yet — coaches are on individual plans."}
      </p>
      <table className="stats-table">
        <thead>
          <tr><th>Coach</th><th>Sessions</th><th>Match days</th><th>Conversations</th><th>Film</th><th>Ratings</th><th>Last active</th></tr>
        </thead>
        <tbody>
          {report.coaches.map((c) => (
            <tr key={c.name}>
              <td><b>{c.name}</b></td>
              <td>{c.sessions}</td>
              <td>{c.matchdays}</td>
              <td>{c.conversations}</td>
              <td>{c.film}</td>
              <td>{c.ratings}</td>
              <td className="muted">{c.lastActiveDay || "—"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td>Club total</td>
            <td>{report.totals.sessions}</td>
            <td>{report.totals.matchdays}</td>
            <td>{report.totals.conversations}</td>
            <td>{report.totals.film}</td>
            <td>{report.totals.ratings}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {isAdmin && report.license.planTier !== "pro" && (
        <div className="no-print" style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>License the whole club:</b>
          <label className="field" style={{ margin: 0 }}>
            <input type="number" min={1} max={200} value={seats} style={{ width: 80 }} onChange={(e) => setSeats(Number(e.target.value))} />
          </label>
          <span className="muted small">Pro seats</span>
          <button className="btn" onClick={() => void buyLicense()}>👑 Buy club license →</button>
          {error && <span className="error-box" style={{ margin: 0 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

// Club mode: the Director of Coaching's view — coach activity, club philosophy,
// and club-wide session distribution.
export function Club({ user }: { user: User }) {
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [error, setError] = useState("");
  const [joinForm, setJoinForm] = useState({ mode: "join", clubCode: "", clubName: "" });
  const [philosophy, setPhilosophy] = useState("");
  const [upload, setUpload] = useState({ title: "", description: "", content: "" });
  const [openSession, setOpenSession] = useState<ClubSession | null>(null);
  const [comments, setComments] = useState<ClubComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [notice, setNotice] = useState("");

  async function openWithComments(s: ClubSession | null) {
    setOpenSession(s);
    setComments([]);
    if (s) {
      try {
        const r = await getJSON<{ comments: ClubComment[] }>(`/api/club/sessions/${s.id}/comments`);
        setComments(r.comments);
      } catch { /* ignore */ }
    }
  }

  async function postComment() {
    if (!openSession || !newComment.trim()) return;
    const r = await sendJSON<{ comments: ClubComment[] }>(`/api/club/sessions/${openSession.id}/comments`, { text: newComment });
    setComments(r.comments);
    setNewComment("");
  }

  const load = useCallback(async () => {
    try {
      const o = await getJSON<ClubOverview>("/api/club/overview");
      setOverview(o);
      setPhilosophy(o.club.philosophy);
      const s = await getJSON<{ sessions: ClubSession[] }>("/api/club/sessions");
      setSessions(s.sessions);
    } catch {
      setOverview(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function joinOrCreate() {
    setError("");
    try {
      await sendJSON("/api/auth/club", joinForm.mode === "join" ? { clubCode: joinForm.clubCode } : { clubName: joinForm.clubName });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!overview) {
    return (
      <div className="fade-in">
        <h1>Club</h1>
        <p className="sub">Join your club to compare progress with fellow coaches, receive the club's sessions, and align with its philosophy — or create a club if you're the DOC.</p>
        <div className="card" style={{ maxWidth: 460 }}>
          <label className="field" style={{ marginBottom: 12 }}>
            I want to…
            <select value={joinForm.mode} onChange={(e) => setJoinForm((f) => ({ ...f, mode: e.target.value }))}>
              <option value="join">Join a club with a code</option>
              <option value="create">Create a club (I'm the DOC/admin)</option>
            </select>
          </label>
          {joinForm.mode === "join" ? (
            <label className="field" style={{ marginBottom: 14 }}>
              Club code
              <input value={joinForm.clubCode} placeholder="e.g. LMSC421" onChange={(e) => setJoinForm((f) => ({ ...f, clubCode: e.target.value }))} />
            </label>
          ) : (
            <label className="field" style={{ marginBottom: 14 }}>
              Club name
              <input value={joinForm.clubName} placeholder="e.g. Lower Merion SC" onChange={(e) => setJoinForm((f) => ({ ...f, clubName: e.target.value }))} />
            </label>
          )}
          <button className="btn" onClick={() => void joinOrCreate()}>Continue →</button>
          {error && <div className="error-box">{error}</div>}
        </div>
      </div>
    );
  }

  const { club, coaches, totals } = overview;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1>{club.name}</h1>
          <p className="sub">
            Invite code: <b style={{ color: "var(--accent)" }}>{club.code}</b> — share it with your coaches.
            {club.isAdmin && " You're the club admin."}
          </p>
        </div>
      </div>

      <div className="action-row">
        <div className="card"><div style={{ fontSize: 24, fontWeight: 800 }}>{totals.coaches}</div><div className="muted small">Coaches</div></div>
        <div className="card"><div style={{ fontSize: 24, fontWeight: 800 }}>{totals.activeToday}</div><div className="muted small">Active today</div></div>
        <div className="card"><div style={{ fontSize: 24, fontWeight: 800 }}>{totals.sessions}</div><div className="muted small">Sessions designed</div></div>
        <div className="card"><div style={{ fontSize: 24, fontWeight: 800 }}>{totals.xp.toLocaleString()}</div><div className="muted small">Club XP</div></div>
      </div>

      <ClubReport isAdmin={club.isAdmin} coachCount={totals.coaches} />

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Coach activity</h2>
        <table className="stats-table">
          <thead>
            <tr><th>Coach</th><th>Level</th><th>XP</th><th>Streak</th><th>Sessions</th><th>Match days</th><th>Last active</th></tr>
          </thead>
          <tbody>
            {coaches.map((c) => (
              <tr key={c.id} style={c.name === user.name ? { background: "var(--accent-bg)" } : undefined}>
                <td><b>{c.name}</b></td>
                <td>Lv {c.level.level} · {c.level.title}</td>
                <td>{c.xp.toLocaleString()}</td>
                <td>🔥 {c.streak}</td>
                <td>{c.sessions}</td>
                <td>{c.matchdays}</td>
                <td className="muted">{c.lastActiveDay || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>🧭 Club philosophy</h2>
          <p className="muted small">Set by the DOC — automatically woven into every coach's AI guidance, sessions, and formations.</p>
          <textarea
            rows={6}
            value={philosophy}
            disabled={!club.isAdmin}
            placeholder={club.isAdmin ? "e.g. We play out from the back at every age group. Development over results through U12. Every player learns multiple positions…" : "Not set yet."}
            onChange={(e) => setPhilosophy(e.target.value)}
          />
          {club.isAdmin && (
            <button
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() =>
                void sendJSON("/api/club/philosophy", { philosophy }, "PUT").then(() => {
                  setNotice("Philosophy saved — it now shapes every coach's AI guidance.");
                  setTimeout(() => setNotice(""), 4000);
                })
              }
            >
              Save philosophy
            </button>
          )}
          {notice && <p style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{notice}</p>}
        </div>

        <div className="card">
          <h2>📦 Club session library</h2>
          <p className="muted small">Sessions the DOC distributes to every coach in the club.</p>
          {sessions.length === 0 && <p className="muted small">Nothing uploaded yet.</p>}
          {sessions.map((s) => (
            <div key={s.id} className="season-row" style={{ cursor: "pointer" }} onClick={() => void openWithComments(openSession?.id === s.id ? null : s)}>
              <span className="kind">📋</span>
              <div>
                <div className="title">{s.title}</div>
                <div className="muted small">{s.description || `by ${s.uploaded_by_name}`}</div>
              </div>
              <span className="when">{s.created_at.slice(0, 10)}</span>
            </div>
          ))}
          {openSession && (
            <div className="card" style={{ marginTop: 10, background: "var(--bg-elev)" }}>
              <h3>{openSession.title}</h3>
              <p className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{openSession.content}</p>
              <h3 style={{ marginTop: 14 }}>💬 Coach discussion ({comments.length})</h3>
              {comments.map((c) => (
                <div key={c.id} className="comment-row">
                  <div className="avatar">{c.author.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <span className="author">{c.author}</span>
                    <span className="when">{c.created_at.slice(0, 10)}</span>
                    <div>{c.text}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  style={{ flex: 1 }}
                  value={newComment}
                  placeholder="Add a note for the club's coaches… (no player last names)"
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void postComment()}
                />
                <button className="btn ghost" onClick={() => void postComment()} disabled={!newComment.trim()}>Post</button>
              </div>
            </div>
          )}
          {club.isAdmin && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <h3>Upload a club session</h3>
              <label className="field" style={{ marginBottom: 10 }}>
                Title
                <input value={upload.title} onChange={(e) => setUpload((u) => ({ ...u, title: e.target.value }))} placeholder="e.g. Club warmup standard: The LMSC Arrival Circuit" />
              </label>
              <label className="field" style={{ marginBottom: 10 }}>
                One-line description
                <input value={upload.description} onChange={(e) => setUpload((u) => ({ ...u, description: e.target.value }))} />
              </label>
              <label className="field" style={{ marginBottom: 12 }}>
                Session content
                <textarea rows={5} value={upload.content} onChange={(e) => setUpload((u) => ({ ...u, content: e.target.value }))} placeholder="Paste the full session: organization, coaching points, progressions…" />
              </label>
              <button
                className="btn"
                disabled={!upload.title || !upload.content}
                onClick={() =>
                  void sendJSON<{ sessions: ClubSession[] }>("/api/club/sessions", upload).then((r) => {
                    setSessions(r.sessions);
                    setUpload({ title: "", description: "", content: "" });
                  })
                }
              >
                Upload to club
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

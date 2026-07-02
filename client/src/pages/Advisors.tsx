import { useEffect, useRef, useState } from "react";
import { getJSON, sendJSON, streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import { goUpgrade, useEntitlements } from "../entitlements";
import type { Advisor, AwardResult, ChatMessage } from "../types";

const CATEGORIES = ["all", "attacking", "defending", "possession", "transition", "development", "management"];
const EMOJIS = ["🧠", "🦁", "🐺", "🦅", "⚔️", "🔮", "🌋", "🧊", "🥷", "🎩"];

export function Advisors() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<Advisor | null>(null);
  const [building, setBuilding] = useState(false);
  const ent = useEntitlements();

  async function load() {
    setAdvisors(await getJSON<Advisor[]>("/api/advisors"));
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);

  if (active) return <ChatView advisor={active} onBack={() => setActive(null)} />;

  const list = filter === "all" ? advisors : advisors.filter((a) => a.category === filter);
  const staffFull = ent !== null && ent.maxStaffAdvisors !== null && ent.staff.length >= ent.maxStaffAdvisors;
  const onStaff = (a: Advisor) => ent?.staff.includes(a.id) ?? false;
  const isLocked = (a: Advisor) => !a.custom && staffFull && !onStaff(a);
  const slotsLeft = ent?.maxStaffAdvisors !== null && ent ? ent.maxStaffAdvisors - ent.staff.length : null;

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>The Advisor Room</h1>
          <p className="sub">
            {advisors.length} coaching minds, every school of thought. Each one shows what team it's <b>good for</b> — or build your own.
            {ent?.maxStaffAdvisors !== null && ent && (
              <> On the free plan you <b>sign {ent.maxStaffAdvisors} advisors to your staff</b> — the first ones you talk to.
              {slotsLeft !== null && slotsLeft > 0 ? ` ${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left.` : " Your staff is set — Pro unlocks everyone."}</>
            )}
          </p>
        </div>
        {ent?.customAdvisors === false ? (
          <button className="btn ghost" onClick={() => void goUpgrade(ent.billingConfigured)}>👑 Build Your Own (Pro)</button>
        ) : (
          <button className="btn" onClick={() => setBuilding(true)}>🧬 Build Your Own</button>
        )}
      </div>

      {building && <AdvisorBuilder onDone={(a) => { setBuilding(false); void load(); if (a) setActive(a); }} />}

      <div className="tabs" style={{ marginBottom: 18 }}>
        {CATEGORIES.map((c) => (
          <button key={c} className={`tab ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>
            {c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid cols-3">
        {list.map((a) => {
          const locked = isLocked(a);
          return (
            <div
              key={a.id}
              className={`card clickable advisor-card ${locked ? "locked" : ""}`}
              onClick={() => (locked ? void goUpgrade(ent?.billingConfigured ?? false) : setActive(a))}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="emoji">{a.emoji}</span>
                {a.custom && <span className="chip" style={{ fontSize: 10, color: "var(--accent)" }}>YOURS</span>}
                {!a.custom && onStaff(a) && <span className="chip" style={{ fontSize: 10, color: "var(--gold)" }}>⭐ ON YOUR STAFF</span>}
                {locked && <span className="chip" style={{ fontSize: 10, color: "var(--gold)" }}>👑 PRO</span>}
              </div>
              <h3 style={{ margin: 0 }}>{a.name}</h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className={`cat ${a.category}`}>{a.category}</span>
                {a.formats?.slice(0, 4).map((f) => (
                  <span key={f} className="fmt-chip">{f}</span>
                ))}
              </div>
              <p className="muted small" style={{ margin: "4px 0 0" }}>{a.tagline}</p>
              <div className="goodfor">
                <span className="goodfor-label">Good for</span>
                <p>{a.goodFor}</p>
              </div>
              {locked && <div className="lock-cta">👑 Upgrade to add {a.name.split(" ")[1] ?? a.name} to your staff →</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdvisorBuilder({ onDone }: { onDone: (advisor: Advisor | null) => void }) {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({ name: "", emoji: "🧠", tagline: "", category: "management", goodFor: "", philosophy: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function create() {
    if (!form.name.trim() || !form.philosophy.trim()) {
      setError("Give your advisor a name and a philosophy.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const r = await sendJSON<{ advisor: Advisor; award: AwardResult }>("/api/advisors/custom", form);
      celebrate(r.award);
      onDone({ ...r.advisor, custom: true, formats: ["4v4", "7v7", "9v9", "11v11", "HS"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create advisor");
      setSaving(false);
    }
  }

  return (
    <div className="card fade-in" style={{ marginBottom: 18, border: "1px solid var(--accent)" }}>
      <h2>🧬 Build Your Own Advisor</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Describe the coaching mind you want — a philosophy, influences, temperament, pet obsessions. TactIQ brings it to life and it joins your Advisor Room permanently.
      </p>
      <div className="form-grid">
        <label className="field">
          Name
          <input value={form.name} placeholder="e.g. The Volcano" onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="field">
          Emoji
          <select value={form.emoji} onChange={(e) => set("emoji", e.target.value)}>
            {EMOJIS.map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
        <label className="field">
          Category
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.filter((c) => c !== "all").map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          Tagline
          <input value={form.tagline} placeholder="One line that captures them" onChange={(e) => set("tagline", e.target.value)} />
        </label>
      </div>
      <label className="field" style={{ marginBottom: 12 }}>
        Philosophy & personality
        <textarea
          rows={4}
          value={form.philosophy}
          placeholder="e.g. Obsessed with counter-attacking through the middle. Believes wingers are overrated. Half street-baller, half math teacher. Quotes boxing metaphors. Demands two-touch maximum in build-up but total freedom in the final third…"
          onChange={(e) => set("philosophy", e.target.value)}
        />
      </label>
      <label className="field" style={{ marginBottom: 16 }}>
        Good for (what teams/scenarios should use this advisor?)
        <input value={form.goodFor} placeholder="e.g. Teams with a great #9 and no wingers" onChange={(e) => set("goodFor", e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn" onClick={() => void create()} disabled={saving}>
          {saving ? "Creating…" : "Create Advisor"}
        </button>
        <button className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}

function ChatView({ advisor, onBack }: { advisor: Advisor; onBack: () => void }) {
  const { celebrate } = useGamify();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;
    setError("");
    setDraft("");
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    let acc = "";
    await streamSSE(
      "/api/chat",
      { advisorId: advisor.id, messages: history },
      {
        onDelta: (t) => {
          acc += t;
          setMessages([...history, { role: "assistant", content: acc }]);
        },
        onDone: (extra) => {
          setStreaming(false);
          celebrate(extra.award);
        },
        onError: (m) => {
          setStreaming(false);
          setError(m);
          setMessages(history);
        },
      },
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <button className="btn ghost" onClick={onBack}>← Advisors</button>
        <div>
          <h2 style={{ margin: 0 }}>
            {advisor.emoji} {advisor.name}
          </h2>
          <span className="muted small">{advisor.tagline}</span>
        </div>
      </div>

      <div className="chat-wrap">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="card" style={{ alignSelf: "center", textAlign: "center", maxWidth: 480, marginTop: 40 }}>
              <div style={{ fontSize: 40 }}>{advisor.emoji}</div>
              <h3>Talk tactics with {advisor.name}</h3>
              <p className="muted small">{advisor.goodFor}</p>
              <p className="muted small">Describe your team's problem, ask for a game plan, or challenge the philosophy. This is a brainstorm — push back.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === "assistant" ? (
                m.content ? (
                  <Markdown text={m.content} />
                ) : (
                  <span className="typing"><span /><span /><span /></span>
                )
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="chat-input-row">
          <input
            value={draft}
            placeholder={`Ask ${advisor.name} anything…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            disabled={streaming}
          />
          <button className="btn" onClick={() => void send()} disabled={streaming || !draft.trim()}>
            {streaming ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

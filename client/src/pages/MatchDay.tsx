import { useEffect, useRef, useState } from "react";
import { getJSON, sendJSON, streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import { RateBar } from "../components/RateBar";
import type { AwardResult, ChatMessage, GamePlan, SeasonEntry, SquadProfile } from "../types";

const SEGMENTS = [
  { id: "pre", label: "🗒️ Pre-Game" },
  { id: "live", label: "📣 Live Bench" },
  { id: "post", label: "🎬 Post-Game" },
];

// Strip stored-markdown noise for display in memory rows.
const clean = (s: string) => s.replace(/#+\s?/g, "").replace(/\s+/g, " ").trim();

export function MatchDay() {
  const [seg, setSeg] = useState("pre");
  const [squad, setSquad] = useState<SquadProfile | null>(null);
  const [gameMemory, setGameMemory] = useState<SeasonEntry[]>([]);

  useEffect(() => {
    void getJSON<{ squad: SquadProfile | null }>("/api/team").then((r) => setSquad(r.squad)).catch(() => {});
    void getJSON<{ season: SeasonEntry[] }>("/api/season")
      .then((r) => setGameMemory(r.season.filter((e) => e.kind === "match").slice(0, 3)))
      .catch(() => {});
  }, []);

  const countdown = (() => {
    if (!squad?.nextGameDate) return null;
    const days = Math.ceil((new Date(squad.nextGameDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return null;
    return days === 0 ? "TODAY" : days === 1 ? "tomorrow" : `in ${days} days`;
  })();

  return (
    <div className="fade-in">
      <h1>Match Day</h1>
      <p className="sub">
        Your professional staff for game day: the briefing before, the bench voice during, and the analyst's debrief after —
        including your Veo / Trace / Wyscout data.
      </p>
      {squad?.nextOpponent && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <b>Next match: vs {squad.nextOpponent}</b>
            {countdown && <span style={{ color: "var(--accent)", fontWeight: 700 }}> — {countdown}</span>}
            {squad.nextGameDate && <span className="muted small"> ({squad.nextGameDate})</span>}
          </div>
          <span className="muted small">Opponent pre-filled below · set in My Team</span>
        </div>
      )}
      <div className="tabs" style={{ marginBottom: 18, maxWidth: 480 }}>
        {SEGMENTS.map((s) => (
          <button key={s.id} className={`tab ${seg === s.id ? "active" : ""}`} onClick={() => setSeg(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {seg === "pre" && <PreGame defaultOpponent={squad?.nextOpponent ?? ""} />}
      {seg === "live" && <LiveBench />}
      {seg === "post" && <PostGame />}
      {gameMemory.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>🧠 Recent game memory</h3>
          {gameMemory.map((e) => (
            <div key={e.id} className="season-row">
              <span className="kind">📣</span>
              <div>
                <div className="title">{e.title}</div>
                <div className="muted small">{clean(e.summary).slice(0, 140)}</div>
              </div>
              <span className="when">{new Date(e.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreGame({ defaultOpponent }: { defaultOpponent: string }) {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({ opponent: "", competition: "", opponentNotes: "", ourLineupThoughts: "", conditions: "" });
  useEffect(() => {
    if (defaultOpponent) setForm((f) => (f.opponent ? f : { ...f, opponent: defaultOpponent }));
  }, [defaultOpponent]);
  const [planData, setPlanData] = useState<GamePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!form.opponent.trim()) {
      setError("Who are you playing?");
      return;
    }
    setError("");
    setLoading(true);
    setPlanData(null);
    try {
      const r = await sendJSON<{ gamePlan: GamePlan; award: AwardResult }>("/api/matchday/pregame", form);
      setPlanData(r.gamePlan);
      celebrate(r.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-grid">
          <label className="field">
            Opponent
            <input value={form.opponent} placeholder="e.g. Rapids FC 2015" onChange={(e) => set("opponent", e.target.value)} />
          </label>
          <label className="field">
            Competition / stakes
            <input value={form.competition} placeholder="e.g. league game, tournament semifinal" onChange={(e) => set("competition", e.target.value)} />
          </label>
          <label className="field">
            Conditions
            <input value={form.conditions} placeholder="e.g. turf, hot, only 12 players" onChange={(e) => set("conditions", e.target.value)} />
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          What do you know about them?
          <textarea rows={2} value={form.opponentNotes} placeholder="e.g. Beat us 3-1 in fall. Fast #9, they press our goal kicks hard, weak left side…" onChange={(e) => set("opponentNotes", e.target.value)} />
        </label>
        <label className="field" style={{ marginBottom: 16 }}>
          Your lineup / availability thoughts
          <textarea rows={2} value={form.ourLineupThoughts} placeholder="e.g. Missing our best defender. Thinking of trying Maya at the 6…" onChange={(e) => set("ourLineupThoughts", e.target.value)} />
        </label>
        <button className="btn" onClick={() => void generate()} disabled={loading}>
          {loading ? "Preparing the briefing…" : "🗒️ Build Game Plan"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>

      {loading && (
        <div className="gen-overlay">
          <span className="spinner" />
          <div>Your staff is scouting the matchup…</div>
        </div>
      )}

      {planData && (
        <div className="fade-in">
          <div className="hero" style={{ paddingBottom: 18 }}>
            <h1 style={{ fontSize: 24 }}>{planData.matchTitle}</h1>
            <ul className="points" style={{ marginTop: 10 }}>
              {planData.keysToTheGame.map((k, i) => (
                <li key={i}><b>{k}</b></li>
              ))}
            </ul>
          </div>
          <div className="grid cols-3">
            <div className="card"><h3>⚡ In possession</h3><ul className="points">{planData.inPossession.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div className="card"><h3>🛡️ Out of possession</h3><ul className="points">{planData.outOfPossession.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div className="card"><h3>🎯 Set pieces</h3><ul className="points">{planData.setPieces.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          </div>
          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div className="card">
              <h3>🔍 Matchups</h3>
              {planData.matchups.map((m, i) => (
                <div key={i} className="season-row">
                  <span className="kind">{m.exploit ? "⚔️" : "🛡️"}</span>
                  <div>
                    <div className="title">{m.zone}</div>
                    <div className="muted small">{m.plan}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>⏱️ First 10 minutes</h3>
              <ul className="points">{planData.firstTenMinutes.map((s, i) => <li key={i}>{s}</li>)}</ul>
              <h3 style={{ marginTop: 12 }}>🪑 Bench notes</h3>
              <ul className="points">{planData.benchNotes.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </div>
          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div className="card"><h3 style={{ color: "var(--red)" }}>If chasing the game</h3><ul className="points">{planData.ifChasing.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div className="card"><h3 style={{ color: "var(--green)" }}>If protecting a lead</h3><ul className="points">{planData.ifProtecting.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          </div>
          <div className="card" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
            <h3>🗣️ Your pregame talk</h3>
            <p style={{ fontSize: 15, lineHeight: 1.7, fontStyle: "italic" }}>"{planData.pregameTalk}"</p>
            <RateBar kind="matchday-pregame" />
          </div>
        </div>
      )}
    </div>
  );
}

function LiveBench() {
  const { celebrate } = useGamify();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const QUICK = ["Down 1-0, they're parking the bus", "Their #10 is killing us in the middle", "Up 2-1, 10 minutes left — see it out", "Halftime: what do I say and change?"];

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || streaming) return;
    setError("");
    setDraft("");
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    let acc = "";
    await streamSSE("/api/matchday/live", { messages: history }, {
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
    });
  }

  return (
    <div className="chat-wrap" style={{ height: "calc(100vh - 320px)" }}>
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <p className="muted small" style={{ textAlign: "center" }}>
              ⚡ Built for the sideline: answers under 120 words, instantly actionable. Tap a situation:
            </p>
            {QUICK.map((s) => (
              <button key={s} className="suggestion" onClick={() => void send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? (
              m.content ? <Markdown text={m.content} /> : <span className="typing"><span /><span /><span /></span>
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
          placeholder="What's happening in the game?"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          disabled={streaming}
        />
        <button className="btn" onClick={() => void send()} disabled={streaming || !draft.trim()}>
          {streaming ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "Send"}
        </button>
      </div>
    </div>
  );
}

function PostGame() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({ result: "", story: "", statsPaste: "" });
  const [image, setImage] = useState<string | undefined>();
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!form.result && !form.story && !form.statsPaste) {
      setError("Give me at least the score or the story.");
      return;
    }
    setError("");
    setAnswer("");
    setStreaming(true);
    let acc = "";
    await streamSSE("/api/matchday/postgame", { ...form, image }, {
      onDelta: (t) => {
        acc += t;
        setAnswer(acc);
      },
      onDone: (extra) => {
        setStreaming(false);
        celebrate(extra.award);
      },
      onError: (m) => {
        setStreaming(false);
        setError(m);
      },
    });
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="form-grid">
          <label className="field">
            Result
            <input value={form.result} placeholder="e.g. L 1-3 vs Rapids" onChange={(e) => set("result", e.target.value)} />
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          What happened? (your account)
          <textarea rows={3} value={form.story} placeholder="e.g. Controlled the first half but couldn't score. They hit us on two counters after our corners…" onChange={(e) => set("story", e.target.value)} />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          Paste your platform data (Veo · Trace · Wyscout · Hudl — possession, shots, xG, sprint data, anything)
          <textarea rows={4} value={form.statsPaste} placeholder={"e.g. from Veo match report:\nPossession 61-39\nShots 14-6 (on target 3-4)\nCorners 8-2\nHighlights: 3 clips of counters conceded…"} onChange={(e) => set("statsPaste", e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>📷 Attach a screenshot (stats page, heatmap, freeze-frame)</button>
          {image && (
            <>
              <img src={image} alt="attached" style={{ height: 42, borderRadius: 8 }} />
              <button className="btn ghost" style={{ padding: "6px 12px" }} onClick={() => setImage(undefined)}>✕</button>
            </>
          )}
        </div>
        <button className="btn" onClick={() => void analyze()} disabled={streaming}>
          {streaming ? "Analyzing…" : "🎬 Run the Debrief"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>

      {(answer || streaming) && (
        <div className="card fade-in">
          {answer ? (
            <>
              <Markdown text={answer} />
              {!streaming && <RateBar kind="matchday-postgame" />}
            </>
          ) : (
            <span className="typing"><span /><span /><span /></span>
          )}
        </div>
      )}
    </div>
  );
}

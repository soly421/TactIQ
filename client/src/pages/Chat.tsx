import { useEffect, useRef, useState } from "react";
import { getJSON, sendJSON, streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import { Playbook } from "./Playbook";

interface Msg {
  role: "user" | "assistant";
  content: string;
  image?: string;
  advisor?: { id: string; name: string; emoji: string }; // second-opinion bubbles
  error?: boolean;
}

interface AdvisorMeta {
  id: string;
  name: string;
  emoji: string;
  custom: boolean;
}

// The staff room: after Sam answers, the advisors whose school of thought
// matches the topic offer a second opinion — one tap brings their read into
// the same thread, against the same team memory.
const OPINION_KEYWORDS: Record<string, string[]> = {
  soler: ["possession", "build out", "build-up", "buildout", "playing out", "keep the ball", "positional", "rondo", "press resistance"],
  vermeer: ["rotation", "positions", "versatile", "every position", "total football", "4v4"],
  richter: ["press", "pressing", "gegenpress", "counter-press", "intensity", "win the ball back", "high press"],
  benedetti: ["defend", "defending", "back line", "conceding", "clean sheet", "leaking", "zonal", "marking", "organized"],
  baptista: ["dribbl", "1v1", "futsal", "flair", "tight space", "take players on", "skill moves"],
  hughes: ["set piece", "corner", "free kick", "long throw", "direct", "target striker", "cross", "second ball"],
  herrera: ["creative", "playmaker", "number 10", "packed defense", "break down", "low block", "unlock", "star player"],
  fontaine: ["athletic", "physical", "outmuscled", "faster", "speed", "agility", "duel"],
  whitfield: ["tryout", "college", "recruit", "showcase", "high school", "rankings", "competitive"],
  marchetti: ["halftime", "protect a lead", "game management", "substitution", "subs", "tournament", "momentum", "losing late", "close games", "clock"],
  lindqvist: ["stats", "data", "metric", "measure", "track", "veo", "trace", "analytics", "xg"],
  okonkwo: ["parent", "confidence", "anxious", "nervous", "culture", "morale", "benched", "crying", "quit", "fun", "burnout"],
  reyes: ["counter", "sit deep", "absorb", "stronger opponent", "giant", "underdog", "low block"],
  obrien: ["volunteer", "rec ", "first season", "overwhelmed", "u6", "u7", "u8", "simple practice"],
  tanaka: ["technique", "technical", "first touch", "weak foot", "ball mastery", "homework", "sloppy"],
  ibarra: ["back three", "wingback", "3-4-2-1", "verticality", "toothless", "control", "no penetration", "sterile"],
};

function suggestAdvisors(text: string, advisors: AdvisorMeta[]): AdvisorMeta[] {
  const t = text.toLowerCase();
  const scored = advisors
    .filter((a) => !a.custom && OPINION_KEYWORDS[a.id])
    .map((a) => ({ a, score: OPINION_KEYWORDS[a.id].reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, 2).map((x) => x.a);
}

const SUGGESTIONS = [
  "Plan my week: we lost 4-1 Saturday and couldn't get out of our half",
  "My best player hogs the ball. How do I coach him without killing his confidence?",
  "Give me a 15-minute warmup for 14 U9s with only 10 cones",
  "We play the top team Sunday. They press high. What's my game plan?",
];

interface DebateVoice {
  advisorId: string;
  name: string;
  emoji: string;
  tagline: string;
  text: string;
}

interface StaffDebate {
  a: DebateVoice;
  b: DebateVoice;
  verdict: string;
}

export function Chat() {
  const { celebrate } = useGamify();
  const [mode, setMode] = useState<"chat" | "guided">("chat");
  const [advisors, setAdvisors] = useState<AdvisorMeta[]>([]);
  const [usedOpinions, setUsedOpinions] = useState<string[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffQ, setStaffQ] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [debate, setDebate] = useState<StaffDebate | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void getJSON<AdvisorMeta[]>("/api/advisors").then(setAdvisors).catch(() => {});
  }, []);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || streaming) return;
    setError("");
    setDraft("");
    const history: Msg[] = [...messages, { role: "user", content, image }];
    setImage(undefined);
    setMessages([...history, { role: "assistant", content: "" }]);
    setUsedOpinions([]);
    setStreaming(true);

    let acc = "";
    await streamSSE(
      "/api/assistant",
      { messages: history.map(({ role, content, image }) => ({ role, content, image })) },
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

  // One tap brings an advisor's read into the same thread: same history,
  // same team memory, their doctrine, capped at a staff-room-sized reply.
  async function secondOpinion(adv: AdvisorMeta) {
    if (streaming) return;
    setUsedOpinions((u) => [...u, adv.id]);
    const history = messages;
    setMessages([...history, { role: "assistant", content: "", advisor: adv }]);
    setStreaming(true);
    let acc = "";
    await streamSSE(
      "/api/chat",
      {
        advisorId: adv.id,
        secondOpinion: true,
        messages: history.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
      },
      {
        onDelta: (t) => {
          acc += t;
          setMessages([...history, { role: "assistant", content: acc, advisor: adv }]);
        },
        onDone: (extra) => {
          if (extra.award) celebrate(extra.award);
          setStreaming(false);
        },
        onError: (msg) => {
          setMessages([...history, { role: "assistant", content: msg, advisor: adv, error: true }]);
          setStreaming(false);
        },
      },
    );
  }

  // Take it to the staff: two opposed advisors argue the question, Sam
  // breaks the tie against this team's memory. Pro; costs three messages.
  async function runDebate() {
    if (!staffQ.trim() || staffBusy) return;
    setStaffBusy(true);
    setStaffError("");
    setDebate(null);
    try {
      const r = await sendJSON<StaffDebate & { award: import("../types").AwardResult }>("/api/staff-debate", { question: staffQ.trim() });
      setDebate(r);
      celebrate(r.award);
    } catch (e) {
      setStaffError(e instanceof Error ? e.message : "The staff room hit a snag");
    }
    setStaffBusy(false);
  }

  // Chips appear once Sam has answered: which schools of thought have a
  // stake in this topic?
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.advisor && m.content);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const opinionChips =
    !streaming && lastAssistant && lastUser
      ? suggestAdvisors(`${lastUser.content} ${lastAssistant.content}`, advisors).filter((a) => !usedOpinions.includes(a.id))
      : [];

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div className="coach-avatar">🧡</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Ask Coach Sam</h1>
          <span className="muted small">Your assistant coach. Tactics, sessions, players, parents — ask anything. Snap a whiteboard or lineup and I'll read it.</span>
        </div>
      </div>

      <div className="tabs" style={{ margin: "10px 0" }}>
        <button className={`tab ${mode === "chat" ? "active" : ""}`} onClick={() => setMode("chat")}>💬 Chat</button>
        <button className={`tab ${mode === "guided" ? "active" : ""}`} onClick={() => setMode("guided")} title="A structured coaching answer: the picture, the fix, how to train it, and what to say to your players">💡 Structured answer</button>
        <button
          className={`tab ${staffOpen ? "active" : ""}`}
          title="Two opposed coaching minds argue your question — Coach Sam breaks the tie for YOUR team (Pro)"
          onClick={() => {
            setStaffOpen(!staffOpen);
            const lastQ = [...messages].reverse().find((m) => m.role === "user");
            if (!staffOpen && !staffQ && lastQ) setStaffQ(lastQ.content);
          }}
        >
          🗣️ Take it to the staff
        </button>
      </div>

      {staffOpen && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              style={{ flex: 1, minWidth: 260 }}
              value={staffQ}
              placeholder="One question for the staff — e.g. should we keep playing out under their press, or go direct?"
              onChange={(e) => setStaffQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runDebate()}
            />
            <button className="btn" disabled={staffBusy || !staffQ.trim()} onClick={() => void runDebate()}>
              {staffBusy ? "The staff is arguing…" : "🗣️ Run the debate"}
            </button>
          </div>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Two opposed schools of thought answer, then Coach Sam breaks the tie using your team's season memory. Costs 3 messages · Pro.
          </p>
          {staffError && (
            <div className="error-box">
              {staffError}
              {/Pro|upgrade/i.test(staffError) && (
                <button className="btn" style={{ marginLeft: 8, fontSize: 11.5, padding: "4px 10px" }} onClick={() => window.dispatchEvent(new Event("tactiq:pricing"))}>👑 Go Pro</button>
              )}
            </div>
          )}
          {debate && (
            <div className="fade-in" style={{ marginTop: 12 }}>
              <div className="grid cols-2" style={{ alignItems: "start" }}>
                {[debate.a, debate.b].map((v) => (
                  <div key={v.advisorId} className="card" style={{ borderTop: "3px solid var(--gold)" }}>
                    <div className="small" style={{ fontWeight: 800, marginBottom: 2 }}>{v.emoji} {v.name}</div>
                    <div className="muted small" style={{ marginBottom: 8 }}>{v.tagline}</div>
                    <Markdown text={v.text} />
                  </div>
                ))}
              </div>
              <div className="card" style={{ marginTop: 10, borderLeft: "3px solid var(--accent)" }}>
                <div className="small" style={{ fontWeight: 800, marginBottom: 6 }}>🧡 Coach Sam — the verdict</div>
                <Markdown text={debate.verdict} />
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "guided" && <Playbook />}

      {mode === "chat" && (
      <div className="chat-wrap">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
              <p className="muted small" style={{ textAlign: "center" }}>Try one of these, coach:</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`} style={m.advisor ? { borderLeft: "3px solid var(--gold)" } : undefined}>
              {m.advisor && (
                <div className="small" style={{ fontWeight: 800, color: "var(--gold)", marginBottom: 4 }}>
                  {m.advisor.emoji} {m.advisor.name} — second opinion
                </div>
              )}
              {m.image && <img src={m.image} alt="attachment" style={{ maxWidth: 220, borderRadius: 10, display: "block", marginBottom: 8 }} />}
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
          {opinionChips.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "4px 2px" }}>
              <span className="muted small">Second opinion:</span>
              {opinionChips.map((a) => (
                <button key={a.id} className="btn ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => void secondOpinion(a)}>
                  {a.emoji} {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <div className="error-box">{error}</div>}
        {image && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8 }}>
            <img src={image} alt="attached" style={{ height: 46, borderRadius: 8 }} />
            <button className="btn ghost" style={{ padding: "6px 12px" }} onClick={() => setImage(undefined)}>✕ Remove</button>
          </div>
        )}
        <div className="chat-input-row">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          <button className="btn ghost attach" title="Attach a photo (whiteboard, lineup…)" onClick={() => fileRef.current?.click()}>📷</button>
          <input
            value={draft}
            placeholder="Ask your assistant coach…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            disabled={streaming}
          />
          <button className="btn" onClick={() => void send()} disabled={streaming || !draft.trim()}>
            {streaming ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "Send"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

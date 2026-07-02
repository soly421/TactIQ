import { useEffect, useRef, useState } from "react";
import { getJSON, streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import type { Advisor, ChatMessage } from "../types";

const CATEGORIES = ["all", "attacking", "defending", "possession", "transition", "development", "management"];

export function Advisors() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<Advisor | null>(null);

  useEffect(() => {
    void getJSON<Advisor[]>("/api/advisors").then(setAdvisors).catch(() => {});
  }, []);

  if (active) return <ChatView advisor={active} onBack={() => setActive(null)} />;

  const list = filter === "all" ? advisors : advisors.filter((a) => a.category === filter);

  return (
    <div className="fade-in">
      <h1>The Advisor Room</h1>
      <p className="sub">24 coaching minds, 24 philosophies. Pick a brain — every advisor knows your team and adapts their style to youth soccer.</p>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {CATEGORIES.map((c) => (
          <button key={c} className={`tab ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>
            {c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid cols-3">
        {list.map((a) => (
          <div key={a.id} className="card clickable advisor-card" onClick={() => setActive(a)}>
            <span className="emoji">{a.emoji}</span>
            <h3 style={{ margin: 0 }}>{a.name}</h3>
            <span className={`cat ${a.category}`}>{a.category}</span>
            <p className="muted small" style={{ margin: "4px 0 0" }}>{a.tagline}</p>
          </div>
        ))}
      </div>
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
            <div className="card" style={{ alignSelf: "center", textAlign: "center", maxWidth: 460, marginTop: 40 }}>
              <div style={{ fontSize: 40 }}>{advisor.emoji}</div>
              <h3>Talk tactics with {advisor.name}</h3>
              <p className="muted small">
                Describe your team's problem, ask for a game plan, or challenge the philosophy. This is a brainstorm — push back.
              </p>
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

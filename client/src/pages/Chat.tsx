import { useEffect, useRef, useState } from "react";
import { streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import { Playbook } from "./Playbook";

interface Msg {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

const SUGGESTIONS = [
  "Plan my week: we lost 4-1 Saturday and couldn't get out of our half",
  "My best player hogs the ball. How do I coach him without killing his confidence?",
  "Give me a 15-minute warmup for 14 U9s with only 10 cones",
  "We play the top team Sunday. They press high. What's my game plan?",
];

export function Chat() {
  const { celebrate } = useGamify();
  const [mode, setMode] = useState<"chat" | "guided">("chat");
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
      </div>

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
            <div key={i} className={`bubble ${m.role}`}>
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

import { useState } from "react";
import { streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { useGamify } from "../components/Gamify";
import { RateBar } from "../components/RateBar";

const TOPICS = [
  "Beating a high press",
  "Breaking down a low block",
  "Defending set pieces",
  "Pressing & winning the ball",
  "Possession & build-up",
  "Transitions & counters",
  "Player development",
  "Game management",
  "Team culture & parents",
  "Other",
];

export function Playbook() {
  const { celebrate } = useGamify();
  const [form, setForm] = useState({ ageGroup: "U12", level: "travel", topic: TOPICS[0], question: "" });
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function ask() {
    if (!form.question.trim() || streaming) return;
    setError("");
    setAnswer("");
    setStreaming(true);
    let acc = "";
    await streamSSE("/api/guidance", form, {
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
    <div className="fade-in">
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <label className="field">
            Age group
            <input value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} />
          </label>
          <label className="field">
            Level
            <select value={form.level} onChange={(e) => set("level", e.target.value)}>
              <option value="rec">Recreational</option>
              <option value="travel">Travel / Club</option>
              <option value="academy">Academy / Elite</option>
            </select>
          </label>
          <label className="field">
            Topic
            <select value={form.topic} onChange={(e) => set("topic", e.target.value)}>
              {TOPICS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="field" style={{ marginBottom: 16 }}>
          What's happening?
          <textarea
            value={form.question}
            rows={3}
            placeholder="e.g. We keep giving the ball away when the other team presses our goal kicks. My defenders panic and boot it…"
            onChange={(e) => set("question", e.target.value)}
          />
        </label>
        <button className="btn" onClick={() => void ask()} disabled={streaming || !form.question.trim()}>
          {streaming ? "Coaching…" : "💡 Get Guidance"}
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>

      {(answer || streaming) && (
        <div className="card fade-in">
          {answer ? (
            <>
              <Markdown text={answer} />
              {!streaming && <RateBar kind="guidance" />}
            </>
          ) : (
            <span className="typing"><span /><span /><span /></span>
          )}
        </div>
      )}
    </div>
  );
}

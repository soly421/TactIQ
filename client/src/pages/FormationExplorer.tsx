import { useMemo, useState } from "react";
import { sendJSON } from "../api";
import { TacticsBoard } from "../components/TacticsBoard";
import { useGamify } from "../components/Gamify";
import { goUpgrade, useEntitlements } from "../entitlements";
import {
  FORMATIONS, SCENARIOS, applyScenario, quickRead, shapeMeters,
  type Formation, type Piece, type ScenarioId,
} from "../formations";
import type { AwardResult } from "../types";

// The Formation Encyclopedia + chess mode. Pick any shape, watch it morph
// through nine game scenarios — then grab a player and move them: the local
// pre-read lands instantly, and the AI engine's verdict follows in ~2s.

interface EngineVerdict {
  headline: string;
  gains: string[];
  risks: string[];
  counterMove: string;
}

interface Read {
  id: number;
  moveLabel: string;
  quick: { gains: string[]; risks: string[] };
  verdict: EngineVerdict | null;
  thinking: boolean;
  error?: string;
}

export function FormationExplorer() {
  const { celebrate } = useGamify();
  const ent = useEntitlements();
  const [format, setFormat] = useState<"7v7" | "9v9" | "11v11">("7v7");
  const [formationId, setFormationId] = useState("7-231");
  const [scenario, setScenario] = useState<ScenarioId>("base");
  const [edits, setEdits] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [ghosts, setGhosts] = useState<Piece[] | null>(null);
  const [reads, setReads] = useState<Read[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [hotPiece, setHotPiece] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("quick");
  const [opponent, setOpponent] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const DEPTHS: { id: "quick" | "standard" | "deep"; label: string; pro: boolean }[] = [
    { id: "quick", label: "⚡ Quick read", pro: false },
    { id: "standard", label: "🔷 Standard", pro: true },
    { id: "deep", label: "🧠 Deep Tactical", pro: true },
  ];

  function pickDepth(d: "quick" | "standard" | "deep", isPro: boolean) {
    if (!isPro && d !== "quick") {
      void goUpgrade(ent?.billingConfigured ?? false);
      return;
    }
    setDepth(d);
  }

  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0];
  const formationsForFormat = FORMATIONS.filter((f) => f.format === format);

  // scenario positions + coach edits layered on top
  const pieces = useMemo(() => {
    const base = applyScenario(formation, scenario);
    return base.map((p) => {
      const e = edits.get(p.id);
      return e ? { ...p, x: e.x, y: e.y } : p;
    });
  }, [formation, scenario, edits]);

  const meters = shapeMeters(pieces);
  const scenarioDef = SCENARIOS.find((s) => s.id === scenario)!;
  const extraNote = formation.notes?.[scenario];

  function pickFormat(f: "7v7" | "9v9" | "11v11") {
    setFormat(f);
    const first = FORMATIONS.find((x) => x.format === f)!;
    setFormationId(first.id);
    resetBoard(first, "base");
  }

  function pickScenario(s: ScenarioId) {
    // ghosts = where players were, so the board draws the movement arrows
    setGhosts(pieces.map((p) => ({ ...p })));
    setScenario(s);
    setEdits(new Map());
    setHotPiece(null);
  }

  function resetBoard(f: Formation = formation, s: ScenarioId = scenario) {
    setGhosts(pieces.map((p) => ({ ...p })));
    setEdits(new Map());
    setReads([]);
    setHistory([]);
    setHotPiece(null);
    void f; void s;
  }

  // The chess move: local pre-read instantly, AI engine verdict async.
  async function onMove(piece: Piece, from: { x: number; y: number }) {
    setEdits((m) => new Map(m).set(piece.id, { x: piece.x, y: piece.y }));
    setHotPiece(piece.id);
    const dir = piece.y < from.y - 4 ? "up the pitch" : piece.y > from.y + 4 ? "deeper" : "across";
    const moveLabel = `${piece.label} → ${dir}`;
    const quick = quickRead(piece, from, pieces);
    const readId = Date.now() + Math.random();
    setReads((r) => [{ id: readId, moveLabel, quick, verdict: null, thinking: true }, ...r].slice(0, 3));

    const moveTxt = `${piece.label} (${piece.role}) from [${Math.round(from.x)},${Math.round(from.y)}] to [${Math.round(piece.x)},${Math.round(piece.y)}]`;
    setHistory((h) => [...h, moveTxt].slice(-8));
    try {
      const r = await sendJSON<{ verdict: EngineVerdict; award: AwardResult; readsLeft: number }>("/api/board/move", {
        format,
        formation: formation.name,
        scenario: scenarioDef.name,
        board: pieces.map((p) => (p.id === piece.id ? { ...p, x: piece.x, y: piece.y } : p)).map(({ label, role, x, y }) => ({ label, role, x, y })),
        move: moveTxt,
        history,
        depth,
        opponent,
      });
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, verdict: r.verdict, thinking: false } : rd)));
      celebrate(r.award);
    } catch (e) {
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, thinking: false, error: e instanceof Error ? e.message : "Engine unavailable" } : rd)));
    }
  }

  // Ask the engine a direct question about the current board + opposition.
  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    const q = question.trim();
    setQuestion("");
    const readId = Date.now() + Math.random();
    setReads((r) => [{ id: readId, moveLabel: `💬 ${q.slice(0, 60)}`, quick: { gains: [], risks: [] }, verdict: null, thinking: true }, ...r].slice(0, 3));
    try {
      const r = await sendJSON<{ verdict: EngineVerdict; award: AwardResult }>("/api/board/move", {
        format,
        formation: formation.name,
        scenario: scenarioDef.name,
        board: pieces.map(({ label, role, x, y }) => ({ label, role, x, y })),
        question: q,
        history,
        depth,
        opponent,
      });
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, verdict: r.verdict, thinking: false } : rd)));
      celebrate(r.award);
    } catch (e) {
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, thinking: false, error: e instanceof Error ? e.message : "Engine unavailable" } : rd)));
    }
    setAsking(false);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div className="tabs" style={{ margin: 0 }}>
            {(["7v7", "9v9", "11v11"] as const).map((f) => (
              <button key={f} className={`tab ${format === f ? "active" : ""}`} onClick={() => pickFormat(f)}>{f}</button>
            ))}
          </div>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted small">Engine:</span>
            {DEPTHS.map((d) => (
              <button
                key={d.id}
                className={`tab ${depth === d.id ? "active" : ""}`}
                style={{ fontSize: 12 }}
                title={d.id === "quick" ? "Fastest, cheapest read" : d.id === "standard" ? "Stronger tactical reasoning (Pro)" : "The flagship engine — maximum depth (Pro)"}
                onClick={() => pickDepth(d.id, ent?.plan === "pro")}
              >
                {d.label}{d.pro && ent?.plan !== "pro" ? " 👑" : ""}
              </button>
            ))}
          </span>
        </div>
        <div className="tabs" style={{ marginTop: 8, marginBottom: 0 }}>
          {formationsForFormat.map((f) => (
            <button key={f.id} className={`tab ${formationId === f.id ? "active" : ""}`} onClick={() => { setFormationId(f.id); setEdits(new Map()); setReads([]); setHistory([]); setGhosts(null); setHotPiece(null); }}>
              {f.name}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>{formation.blurb}</p>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {SCENARIOS.map((s) => (
          <button key={s.id} className={`tab ${scenario === s.id ? "active" : ""}`} onClick={() => pickScenario(s.id)}>
            {s.emoji} {s.name}
          </button>
        ))}
        <button className={`tab ${compare ? "active" : ""}`} onClick={() => setCompare(!compare)}>⫶ 3-Split</button>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>🆚 Opposition:</span>
          <input
            style={{ flex: 1, minWidth: 200 }}
            value={opponent}
            placeholder="e.g. they press high with 3, fast winger on their right…"
            onChange={(e) => setOpponent(e.target.value)}
          />
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>💬 Ask the engine:</span>
          <input
            style={{ flex: 1.2, minWidth: 220 }}
            value={question}
            placeholder="e.g. what build-out technique should we use here?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void ask()}
          />
          <button className="btn" style={{ fontSize: 12.5, padding: "8px 14px" }} disabled={asking || !question.trim()} onClick={() => void ask()}>
            {asking ? "…" : "Ask"}
          </button>
        </div>
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          The opposition context shapes <b>every</b> engine read — moves and questions both answer against it.
        </p>
      </div>

      {compare ? (
        <div className="split-view">
          {(["buildup", "midblock", "lowblock"] as ScenarioId[]).map((s) => (
            <div key={s} className="card" style={{ padding: 10 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                {SCENARIOS.find((x) => x.id === s)!.emoji} {SCENARIOS.find((x) => x.id === s)!.name}
              </div>
              <TacticsBoard pieces={applyScenario(formation, s)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="explorer-grid">
          <div>
            <div className="card" style={{ padding: 10 }}>
              <TacticsBoard pieces={pieces} ghosts={ghosts} onMove={onMove} highlight={hotPiece} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                <div className="meters">
                  <Meter label="Compact" value={meters.compact} color="var(--turquoise)" />
                  <Meter label="Width" value={meters.width} color="var(--accent)" />
                  <Meter label="Cover" value={meters.cover} color="var(--gold)" />
                </div>
                <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => resetBoard()}>↺ Reset shape</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* engine reads — the chess annotations */}
            {reads.map((r) => (
              <div key={r.id} className="card engine-read fade-in">
                <div className="er-head">
                  <b>♟️ {r.moveLabel}</b>
                  {r.thinking && <span className="er-thinking">engine reading<span className="typing" style={{ marginLeft: 4 }}><span /><span /><span /></span></span>}
                </div>
                {r.verdict ? (
                  <>
                    <p className="er-headline">{r.verdict.headline}</p>
                    {r.verdict.gains.map((g, i) => <div key={`g${i}`} className="er-line gain">✓ {g}</div>)}
                    {r.verdict.risks.map((k, i) => <div key={`r${i}`} className="er-line risk">⚠ {k}</div>)}
                    <div className="er-counter">↪ {r.verdict.counterMove}</div>
                  </>
                ) : (
                  <>
                    {r.quick.gains.map((g, i) => <div key={`qg${i}`} className="er-line gain">✓ {g}</div>)}
                    {r.quick.risks.map((k, i) => <div key={`qr${i}`} className="er-line risk">⚠ {k}</div>)}
                    {r.error && (
                      <div className="er-line risk">
                        {r.error}
                        {/Pro|upgrade/i.test(r.error) && (
                          <button className="btn" style={{ marginLeft: 8, fontSize: 11.5, padding: "4px 10px" }} onClick={() => void goUpgrade(ent?.billingConfigured ?? false)}>👑 Go Pro</button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* scenario coaching points */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{scenarioDef.emoji} {scenarioDef.name} — {formation.name}</h3>
              <ul className="points">
                {scenarioDef.points.map((p, i) => <li key={i}>{p}</li>)}
                {extraNote && <li style={{ color: "var(--gold)" }}><b>{formation.name}:</b> {extraNote}</li>}
              </ul>
              {reads.length === 0 && (
                <p className="muted small" style={{ marginBottom: 0 }}>
                  ♟️ Now grab a player and move them — the engine tells you what you gain and what you give away, like a chess engine
                  annotating your move.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="meter" title={`${label}: ${value}/100`}>
      <span className="m-label">{label}</span>
      <div className="m-track"><div className="m-fill" style={{ width: `${value}%`, background: color }} /></div>
      <span className="m-val">{value}</span>
    </div>
  );
}

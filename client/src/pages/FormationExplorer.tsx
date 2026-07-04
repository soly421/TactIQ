import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { formatForAge, NO_FORMATION_NOTE } from "../age";
import { FormationAnalysisView } from "../components/FormationAnalysisView";
import { TacticsBoard } from "../components/TacticsBoard";
import { useGamify } from "../components/Gamify";
import { goUpgrade, useEntitlements } from "../entitlements";
import {
  CHOREO, FORMATIONS, SCENARIOS, applyScenario, matchupCallouts, quickRead, resolveBallPath, shapeMeters,
  type Formation, type Piece, type ScenarioId,
} from "../formations";
import type { AwardResult, FormationAnalysis } from "../types";

// The Formation Encyclopedia + chess mode. Pick any shape, watch it morph
// through nine game scenarios — or hit Play and watch the movement unfold:
// the ball travels its story while the lines move in coaching order. Then
// grab a player: the local pre-read lands instantly, the AI verdict follows.
// The opposition goes on the pitch too — pick THEIR formation and posture,
// or drop lone markers — and every engine read is weighed against them.

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

// Opposition postures reuse the same scenario engine, applied to THEIR shape
// and rotated 180° onto our half — their high press hunts our build-up.
const OPP_POSTURES: { id: ScenarioId; label: string }[] = [
  { id: "base", label: "📐 Their shape" },
  { id: "highpress", label: "⚡ High press" },
  { id: "midblock", label: "🧊 Mid block" },
  { id: "lowblock", label: "🏰 Low block" },
];

function mirrorOpponents(f: Formation, posture: ScenarioId): Piece[] {
  return applyScenario(f, posture).map((p, i) => ({
    id: `opp-${i + 1}`,
    role: "OPP" as const,
    label: p.label, // their real position label — callouts read "their RCB", not "their O3"
    x: Math.round(100 - p.x),
    y: Math.round(100 - p.y),
  }));
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
  const [oppPieces, setOppPieces] = useState<Piece[]>([]);
  const [oppFormationId, setOppFormationId] = useState("");
  const [oppPosture, setOppPosture] = useState<ScenarioId>("base");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [smallSided, setSmallSided] = useState(false);
  const [squadInfo, setSquadInfo] = useState<{ ageGroup?: string; preferredStyle?: string } | null>(null);

  // The full game-model report (the old AI Formation Analysis, now one tap
  // from the board — format, age, style, and opposition all come from here).
  const [report, setReport] = useState<FormationAnalysis | null>(null);
  const [reportEntryId, setReportEntryId] = useState<number | undefined>();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // ---- scenario playback: staggered waves of movement + the ball's story ----
  const [playing, setPlaying] = useState(false);
  const [wave, setWave] = useState(0);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Open the board on the coach's own format — an 11v11 coach shouldn't land
  // on a 7v7 pitch. 4v4 teams (U6-U8) get the 7v7 board plus the why-note.
  useEffect(() => {
    void getJSON<{ squad: { ageGroup?: string; format?: string; preferredStyle?: string } | null }>("/api/team")
      .then((r) => {
        if (!r.squad) return;
        setSquadInfo({ ageGroup: r.squad.ageGroup, preferredStyle: r.squad.preferredStyle });
        const derived = formatForAge(r.squad.ageGroup) ?? r.squad.format;
        if (derived === "4v4") {
          setSmallSided(true);
          return; // stays on the 7v7 default
        }
        if (derived === "9v9" || derived === "11v11") {
          setFormat(derived);
          setFormationId(FORMATIONS.find((x) => x.format === derived)!.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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
  const oppFormations = formationsForFormat; // they play the same format

  // scenario positions + coach edits layered on top
  const scenarioPieces = useMemo(() => {
    const base = applyScenario(formation, scenario);
    return base.map((p) => {
      const e = edits.get(p.id);
      return e ? { ...p, x: e.x, y: e.y } : p;
    });
  }, [formation, scenario, edits]);

  // During playback, lines are released wave by wave: unreleased lines hold
  // their base spots, released lines glide to the scenario picture.
  const pieces = useMemo(() => {
    if (!playing) return scenarioPieces;
    const choreo = CHOREO[scenario];
    if (!choreo) return scenarioPieces;
    const released = new Set(choreo.waves.slice(0, wave).flat());
    const base = applyScenario(formation, "base");
    return scenarioPieces.map((p) => {
      if (released.has(p.role)) return p;
      const b = base.find((x) => x.id === p.id)!;
      return { ...p, x: b.x, y: b.y };
    });
  }, [playing, wave, scenario, formation, scenarioPieces]);

  const meters = shapeMeters(scenarioPieces);
  // The matchup layer: instructions + recommended ball route against the
  // placed opposition, recomputed on every drag of either color.
  const [showTips, setShowTips] = useState(true);
  const matchup = useMemo(
    () => matchupCallouts(scenarioPieces, oppPieces, scenario),
    [scenarioPieces, oppPieces, scenario],
  );
  const tipsOn = showTips && oppPieces.length > 0 && scenario !== "base";
  const scenarioDef = SCENARIOS.find((s) => s.id === scenario)!;
  const extraNote = formation.notes?.[scenario];
  const oppPayload = oppPieces.map(({ label, x, y }) => ({ label, x: Math.round(x), y: Math.round(y) }));

  function stopPlayback() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
    setWave(0);
    setBall(null);
  }

  // Play the scenario as a sequence: lines move in coaching order while the
  // ball travels its authored story, then it loops until stopped.
  function play() {
    if (playing) { stopPlayback(); return; }
    const choreo = CHOREO[scenario];
    if (!choreo) return;
    setEdits(new Map());
    setGhosts(null);
    setHotPiece(null);
    const target = applyScenario(formation, scenario);
    // with an opponent on the board, the ball plays the MATCHUP route (through
    // the free man / into the trap) instead of the generic scenario story
    const vsOpp = matchupCallouts(target, oppPieces, scenario).ballPath;
    const path = oppPieces.length && vsOpp.length >= 2 ? vsOpp : resolveBallPath(target, choreo);
    setPlaying(true);

    const runCycle = () => {
      setWave(0);
      setBall(path[0] ?? null);
      const t = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
      t(450, () => setWave(1));
      t(1000, () => setWave(2));
      t(1550, () => setWave(3));
      path.forEach((wp, i) => { if (i > 0) t(700 + i * 800, () => setBall(wp)); });
      const total = Math.max(2400, 700 + path.length * 800 + 700);
      t(total, () => { setWave(0); setBall(path[0] ?? null); }); // glide home
      t(total + 1300, runCycle);                                  // and go again
    };
    runCycle();
  }

  function pickFormat(f: "7v7" | "9v9" | "11v11") {
    stopPlayback();
    setFormat(f);
    const first = FORMATIONS.find((x) => x.format === f)!;
    setFormationId(first.id);
    setOppFormationId("");
    setOppPieces([]);
    resetBoard();
  }

  function pickScenario(s: ScenarioId) {
    stopPlayback();
    // ghosts = where players were, so the board draws the movement arrows
    setGhosts(scenarioPieces.map((p) => ({ ...p })));
    setScenario(s);
    setEdits(new Map());
    setHotPiece(null);
  }

  // Clears board edits/reads for the CURRENT formation+scenario state —
  // callers change those via setState first, then reset.
  function resetBoard() {
    stopPlayback();
    setGhosts(scenarioPieces.map((p) => ({ ...p })));
    setEdits(new Map());
    setReads([]);
    setHistory([]);
    setHotPiece(null);
  }

  // ---- Opposition layer: their shape + posture, lone markers, drag, remove ----
  function pickOppFormation(id: string) {
    setOppFormationId(id);
    const f = FORMATIONS.find((x) => x.id === id);
    if (f) setOppPieces(mirrorOpponents(f, oppPosture));
    else setOppPieces([]);
  }

  function pickOppPosture(p: ScenarioId) {
    setOppPosture(p);
    const f = FORMATIONS.find((x) => x.id === oppFormationId);
    if (f) setOppPieces(mirrorOpponents(f, p));
  }

  function addOpp() {
    setOppPieces((ops) => {
      if (ops.length >= 11) return ops;
      const n = ops.reduce((m, o) => Math.max(m, Number(o.id.split("-")[1]) || 0), 0) + 1;
      const i = ops.length;
      return [...ops, { id: `opp-${n}`, role: "OPP" as const, label: `O${n}`, x: 38 + (i % 3) * 12, y: 58 + Math.floor(i / 3) * 9 }];
    });
  }

  function moveOpp(p: Piece) {
    setOppPieces((ops) => ops.map((o) => (o.id === p.id ? { ...o, x: p.x, y: p.y } : o)));
    setHistory((h) => [...h, `their ${p.label} shifted to [${Math.round(p.x)},${Math.round(p.y)}]`].slice(-8));
  }

  function removeOpp(id: string) {
    setOppPieces((ops) => ops.filter((o) => o.id !== id));
  }

  // Instant local read of the new position against the opposition markers —
  // lands before the engine verdict so placement feels alive immediately.
  function oppQuickLines(piece: Piece): { gains: string[]; risks: string[] } {
    if (!oppPieces.length) return { gains: [], risks: [] };
    let nearest: Piece | null = null;
    let best = Infinity;
    for (const o of oppPieces) {
      const d = Math.hypot(o.x - piece.x, o.y - piece.y);
      if (d < best) { best = d; nearest = o; }
    }
    if (nearest && best < 10) return { gains: [], risks: [`Right into their ${nearest.label}'s zone — expect instant pressure`] };
    if (best > 18) return { gains: [`Free space — no red shirt within ${Math.round(best)} on the grid`], risks: [] };
    return { gains: [], risks: [] };
  }

  // The chess move: local pre-read instantly, AI engine verdict async.
  async function onMove(piece: Piece, from: { x: number; y: number }) {
    stopPlayback();
    setEdits((m) => new Map(m).set(piece.id, { x: piece.x, y: piece.y }));
    setHotPiece(piece.id);
    const dir = piece.y < from.y - 4 ? "up the pitch" : piece.y > from.y + 4 ? "deeper" : "across";
    const moveLabel = `${piece.label} → ${dir}`;
    const base = quickRead(piece, from, scenarioPieces);
    const vsOpp = oppQuickLines(piece);
    const quick = { gains: [...vsOpp.gains, ...base.gains].slice(0, 3), risks: [...vsOpp.risks, ...base.risks].slice(0, 3) };
    const readId = Date.now() + Math.random();
    setReads((r) => [{ id: readId, moveLabel, quick, verdict: null, thinking: true }, ...r].slice(0, 3));

    const moveTxt = `${piece.label} (${piece.role}) from [${Math.round(from.x)},${Math.round(from.y)}] to [${Math.round(piece.x)},${Math.round(piece.y)}]`;
    setHistory((h) => [...h, moveTxt].slice(-8));
    try {
      const r = await sendJSON<{ verdict: EngineVerdict; award: AwardResult; readsLeft: number }>("/api/board/move", {
        format,
        formation: formation.name,
        scenario: scenarioDef.name,
        board: scenarioPieces.map((p) => (p.id === piece.id ? { ...p, x: piece.x, y: piece.y } : p)).map(({ label, role, x, y }) => ({ label, role, x, y })),
        move: moveTxt,
        history,
        depth,
        opponent,
        opponents: oppPayload,
      });
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, verdict: r.verdict, thinking: false } : rd)));
      celebrate(r.award);
    } catch (e) {
      setReads((rs) => rs.map((rd) => (rd.id === readId ? { ...rd, thinking: false, error: e instanceof Error ? e.message : "Engine unavailable" } : rd)));
    }
  }

  // Generate the full game-model report for the current formation, grounded
  // in the team profile and the opposition set on this board.
  async function generateReport() {
    if (reportLoading) return;
    setReportLoading(true);
    setReportError("");
    try {
      const r = await sendJSON<{ analysis: FormationAnalysis; award: AwardResult; entryId?: number }>("/api/formation", {
        format,
        ageGroup: squadInfo?.ageGroup || (format === "7v7" ? "U9" : format === "9v9" ? "U11" : "U13"),
        style: `${squadInfo?.preferredStyle || ""} — the coach is exploring a ${formation.name}`.trim(),
        opponentNotes: [opponent, oppPieces.length ? `their on-board positions: ${oppPayload.map((o) => `${o.label}[${o.x},${o.y}]`).join(" ")}` : ""].filter(Boolean).join("; "),
        depth: depth === "quick" ? "quick" : depth === "deep" ? "deep" : "standard",
      });
      setReport(r.analysis);
      setReportEntryId(r.entryId);
      celebrate(r.award);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Report failed");
    }
    setReportLoading(false);
  }

  // Ask the engine a direct question about the current board + opposition.
  async function ask() {
    if (!question.trim() || asking) return;
    const q = question.trim();
    setQuestion("");
    await askQuestion(q);
  }

  // One-tap AI read of the whole matchup — composes the question the coach
  // is really asking when both formations are on the board.
  async function readMatchup() {
    const oppF = FORMATIONS.find((x) => x.id === oppFormationId);
    const posture = OPP_POSTURES.find((x) => x.id === oppPosture);
    await askQuestion(
      `We are a ${formation.name} in ${scenarioDef.name} against their ${oppF ? oppF.name : "shape as placed"}${posture && posture.id !== "base" ? ` (${posture.label.slice(posture.label.indexOf(" ") + 1)})` : ""}. Give me the game plan for THIS matchup: who presses/marks whom, where their free man is, the space we attack, and the ONE instruction to shout first.`,
    );
  }

  async function askQuestion(q: string) {
    if (asking) return;
    setAsking(true);
    const readId = Date.now() + Math.random();
    setReads((r) => [{ id: readId, moveLabel: `💬 ${q.slice(0, 60)}`, quick: { gains: [], risks: [] }, verdict: null, thinking: true }, ...r].slice(0, 3));
    try {
      const r = await sendJSON<{ verdict: EngineVerdict; award: AwardResult }>("/api/board/move", {
        format,
        formation: formation.name,
        scenario: scenarioDef.name,
        board: scenarioPieces.map(({ label, role, x, y }) => ({ label, role, x, y })),
        question: q,
        history,
        depth,
        opponent,
        opponents: oppPayload,
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
            <button key={f.id} className={`tab ${formationId === f.id ? "active" : ""}`} onClick={() => { stopPlayback(); setFormationId(f.id); setEdits(new Map()); setReads([]); setHistory([]); setGhosts(null); setHotPiece(null); }}>
              {f.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <p className="muted small" style={{ margin: 0 }}>{formation.blurb}</p>
          <button className="btn ghost" style={{ fontSize: 12 }} disabled={reportLoading} onClick={() => void generateReport()} title="The complete AI game model for this shape: phases, strengths, vulnerabilities, training priorities">
            {reportLoading ? "Building the game model…" : "🔬 Full game-model report"}
          </button>
        </div>
        {reportError && <div className="error-box">{reportError}</div>}
        {smallSided && <p className="small" style={{ margin: "8px 0 0", color: "var(--gold)" }}>⚽ {NO_FORMATION_NOTE}</p>}
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {SCENARIOS.map((s) => (
          <button key={s.id} className={`tab ${scenario === s.id ? "active" : ""}`} onClick={() => pickScenario(s.id)}>
            {s.emoji} {s.name}
          </button>
        ))}
        <button className={`tab ${compare ? "active" : ""}`} onClick={() => { stopPlayback(); setCompare(!compare); }}>⫶ 3-Split</button>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap", color: "#e5484d" }}>🔴 Opposition:</span>
          <select value={oppFormationId} onChange={(e) => pickOppFormation(e.target.value)} style={{ fontSize: 12.5 }}>
            <option value="">Their formation…</option>
            {oppFormations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {oppFormationId && OPP_POSTURES.map((p) => (
            <button key={p.id} className={`tab ${oppPosture === p.id ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => pickOppPosture(p.id)}>
              {p.label}
            </button>
          ))}
          <button className="btn ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={addOpp} disabled={oppPieces.length >= 11}>
            + Lone marker
          </button>
          {oppPieces.length > 0 && (
            <>
              <span className="pill" style={{ fontSize: 11.5 }}>{oppPieces.length} placed</span>
              <button className="btn ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => { setOppPieces([]); setOppFormationId(""); }}>✕ Clear</button>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>🆚 Their game plan:</span>
          <input
            style={{ flex: 1, minWidth: 200 }}
            value={opponent}
            placeholder="e.g. fast winger on their right, they go long from goal kicks…"
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
          {oppPieces.length > 0
            ? <>Pick their formation and posture — the red shirts take up REAL positions. Drag any marker to match what you've scouted, <b>double-tap one to remove it</b>. Every move and question is read against them.</>
            : <>Set up the opposition the way you scout them: their formation + how they play (press high / sit mid / park deep) — or drop lone markers. The engine weighs <b>every</b> read against them.</>}
        </p>
      </div>

      {compare ? (
        <div className="split-view">
          {(["buildup", "midblock", "lowblock"] as ScenarioId[]).map((s) => (
            <div key={s} className="card" style={{ padding: 10 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                {SCENARIOS.find((x) => x.id === s)!.emoji} {SCENARIOS.find((x) => x.id === s)!.name}
              </div>
              <TacticsBoard pieces={applyScenario(formation, s)} opponents={oppPieces} />
            </div>
          ))}
        </div>
      ) : (
        <div className="explorer-grid">
          <div>
            <div className="card" style={{ padding: 10 }}>
              <TacticsBoard
                pieces={pieces}
                ghosts={playing ? null : ghosts}
                onMove={onMove}
                opponents={oppPieces}
                onMoveOpp={moveOpp}
                onRemoveOpp={removeOpp}
                highlight={playing ? null : hotPiece}
                ball={ball}
                callouts={tipsOn && !playing ? matchup.callouts : undefined}
                suggestedPath={tipsOn ? matchup.ballPath : undefined}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                <div className="meters">
                  <Meter label="Compact" value={meters.compact} color="var(--turquoise)" />
                  <Meter label="Width" value={meters.width} color="var(--accent)" />
                  <Meter label="Cover" value={meters.cover} color="var(--gold)" />
                </div>
                <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                  {oppPieces.length > 0 && scenario !== "base" && (
                    <button className={`tab ${showTips ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => setShowTips(!showTips)} title="Numbered coaching callouts + the recommended ball route against this opponent">
                      💡 Matchup tips
                    </button>
                  )}
                  {scenario !== "base" && (
                    <button className="btn" style={{ fontSize: 12 }} onClick={play}>
                      {playing ? "◼ Stop" : oppPieces.length ? "▶ Play it vs them" : "▶ Play the movement"}
                    </button>
                  )}
                  <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => resetBoard()}>↺ Reset shape</button>
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* the matchup plan — numbered to match the badges on the pitch */}
            {tipsOn && matchup.callouts.length > 0 && (
              <div className="card fade-in" style={{ borderTop: "3px solid #4cc9f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <h3 style={{ margin: 0 }}>🎯 The matchup plan</h3>
                  <button className="btn" style={{ fontSize: 11.5, padding: "5px 10px" }} disabled={asking} onClick={() => void readMatchup()} title="One engine read of the whole matchup — who marks whom, their free man, our space, the first instruction to shout">
                    {asking ? "reading…" : "🧠 Engine read"}
                  </button>
                </div>
                <p className="muted small" style={{ margin: "4px 0 8px" }}>
                  Numbered on the pitch. The dashed line is where the ball should go — hit <b>▶ Play it vs them</b> to watch it.
                </p>
                {matchup.callouts.map((c) => (
                  <div key={c.n} className="small" style={{ display: "flex", gap: 8, marginBottom: 6, lineHeight: 1.45 }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: 9, textAlign: "center", fontWeight: 900, fontSize: 12,
                      background: c.kind === "press" ? "#ffd166" : c.kind === "free" ? "#2dd47a" : c.kind === "exploit" ? "#4cc9f0" : "#ff5d5d",
                      color: "#10131f",
                    }}>{c.n}</span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            )}

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
                  {scenario === "base"
                    ? <>♟️ Pick a scenario and hit <b>▶ Play</b> to watch the movement — then grab a player and move them: the engine tells you what you gain and what you give away, like a chess engine annotating your move.</>
                    : <>♟️ Hit <b>▶ Play the movement</b> to watch how the shape gets here — then grab a player and move them for the engine's read.</>}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {report && (
        <div style={{ marginTop: 16 }}>
          <FormationAnalysisView analysis={report} entryId={reportEntryId} />
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

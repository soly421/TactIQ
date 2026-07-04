import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { formatForAge, NO_FORMATION_NOTE } from "../age";
import { FormationAnalysisView } from "../components/FormationAnalysisView";
import { TacticsBoard } from "../components/TacticsBoard";
import { useGamify } from "../components/Gamify";
import { goUpgrade, useEntitlements } from "../entitlements";
import {
  FORMATIONS, SCENARIO_BALL, SCENARIOS, applyScenario, geometryFacts, matchupCallouts,
  resolveCollisions, scenarioFromText, shapeMeters,
  type MatchupCallout, type Piece, type ScenarioId,
} from "../formations";
import type { AwardResult, FormationAnalysis } from "../types";

// The board: pick your shape, set what you're facing, and DESCRIBE the
// situation in your own words — the engine paints the answer: positions for
// every player, the ball's route, numbered instructions, one headline.
// The math layer feeds verified counts IN and validates the paint coming
// OUT; the AI does all the talking. Without an engine key, the closest
// authored scenario picture stands in, clearly labeled.

interface PaintedPicture {
  headline: string;
  rationale: string;
  positions: { label: string; x: number; y: number }[];
  opponentPositions?: { label: string; x: number; y: number }[];
  ballPath: { x: number; y: number }[];
  callouts: { kind: "press" | "free" | "exploit" | "danger"; x: number; y: number; fromLabel?: string; text: string }[];
  demo?: boolean;
}

const EXAMPLE_CHIPS: { label: string; text: string }[] = [
  { label: "🌪️ High press", text: "Press their build-up high — force it wide and trap on the touchline." },
  { label: "🧊 Mid block", text: "Set a compact mid block: screen their pivot, shift together, and trap the entry pass into midfield." },
  { label: "🏰 Defend a lead", text: "We are 1-0 up with 10 minutes left and they are throwing everyone forward. Show me how we defend and where the ball goes when we win it." },
  { label: "🧱 Break their press", text: "They press us high on goal kicks. Show me how we build out and beat the press." },
  { label: "🎯 Wide overload", text: "Overload the right side, isolate their left back, and get to the byline for cutbacks." },
  { label: "🚀 Counter-attack", text: "The moment we win the ball in midfield, counter fast — who runs, who stays, where does the first pass go?" },
];

const clampG = (v: number, lo = 3, hi = 97) => Math.min(hi, Math.max(lo, Math.round(v)));

export function FormationExplorer() {
  const { celebrate } = useGamify();
  const ent = useEntitlements();
  const [live, setLive] = useState(true);
  const [format, setFormat] = useState<"7v7" | "9v9" | "11v11">("7v7");
  const [formationId, setFormationId] = useState("7-231");
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("quick");
  const [smallSided, setSmallSided] = useState(false);
  const [squadInfo, setSquadInfo] = useState<{ ageGroup?: string; preferredStyle?: string } | null>(null);

  // the paint + the coach's hand-adjustments on top of it
  const [scenarioText, setScenarioText] = useState("");
  const [paint, setPaint] = useState<PaintedPicture | null>(null);
  const [painting, setPainting] = useState(false);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [ghosts, setGhosts] = useState<Piece[] | null>(null);
  const [boardDirty, setBoardDirty] = useState(false); // dragged since last paint

  // opposition
  const [opponent, setOpponent] = useState("");
  const [oppPieces, setOppPieces] = useState<Piece[]>([]);
  const [oppFormationId, setOppFormationId] = useState("");

  // ball playback along the painted route
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // full game-model report (unchanged feature)
  const [report, setReport] = useState<FormationAnalysis | null>(null);
  const [reportEntryId, setReportEntryId] = useState<number | undefined>();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    void getJSON<{ live: boolean }>("/api/health").then((h) => setLive(h.live)).catch(() => {});
    void getJSON<{ squad: { ageGroup?: string; format?: string; preferredStyle?: string } | null }>("/api/team")
      .then((r) => {
        if (!r.squad) return;
        setSquadInfo({ ageGroup: r.squad.ageGroup, preferredStyle: r.squad.preferredStyle });
        const derived = formatForAge(r.squad.ageGroup) ?? r.squad.format;
        if (derived === "4v4") {
          setSmallSided(true);
          return;
        }
        if (derived === "9v9" || derived === "11v11") {
          setFormat(derived);
          setFormationId(FORMATIONS.find((x) => x.format === derived)!.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // guards the in-flight paint: a stale response must never land on a board
  // the coach has since switched away from
  const paintSeq = useRef(0);

  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0];
  const formationsForFormat = FORMATIONS.filter((f) => f.format === format);

  // current board = base formation, overridden by the paint, overridden by drags
  const pieces = useMemo(() => {
    const posByLabel = new Map((paint?.positions ?? []).map((p) => [p.label, p]));
    return formation.pieces.map((p) => {
      const e = edits.get(p.id);
      if (e) return { ...p, x: e.x, y: e.y };
      const t = posByLabel.get(p.label);
      return t ? { ...p, x: t.x, y: t.y } : { ...p };
    });
  }, [formation, paint, edits]);

  const shownOpps = useMemo(() => {
    if (!paint?.opponentPositions?.length) return oppPieces;
    const byLabel = new Map(paint.opponentPositions.map((p) => [p.label, p]));
    return oppPieces.map((o) => {
      const t = byLabel.get(o.label);
      return t ? { ...o, x: t.x, y: t.y } : o;
    });
  }, [oppPieces, paint]);

  const meters = shapeMeters(pieces);
  const boardCallouts: MatchupCallout[] | undefined = useMemo(() => {
    if (!paint || playing) return undefined;
    return paint.callouts.map((c, i) => ({
      n: i + 1,
      kind: c.kind,
      x: c.x,
      y: c.y,
      from: c.fromLabel ? (() => { const f = pieces.find((p) => p.label === c.fromLabel); return f ? { x: f.x, y: f.y } : undefined; })() : undefined,
      text: c.text,
    }));
  }, [paint, pieces, playing]);

  const DEPTHS: { id: "quick" | "standard" | "deep"; label: string; pro: boolean }[] = [
    { id: "quick", label: "⚡ Quick paint", pro: false },
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

  function stopPlayback() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
    setBallPos(null);
  }

  function clearPaint() {
    paintSeq.current++; // orphan any in-flight paint
    setPainting(false);
    stopPlayback();
    setPaint(null);
    setEdits(new Map());
    setGhosts(null);
    setBoardDirty(false);
    setError("");
  }

  function pickFormat(f: "7v7" | "9v9" | "11v11") {
    clearPaint();
    setFormat(f);
    setFormationId(FORMATIONS.find((x) => x.format === f)!.id);
    setOppFormationId("");
    setOppPieces([]);
  }

  function pickFormation(id: string) {
    clearPaint();
    setFormationId(id);
  }

  // ---- opposition: their base shape mirrored onto our half + lone markers.
  // How they PLAY goes in the game-plan text — the engine reads it there.
  function pickOppFormation(id: string) {
    setOppFormationId(id);
    const f = FORMATIONS.find((x) => x.id === id);
    if (f) {
      setOppPieces(applyScenario(f, "base").map((p, i) => ({
        id: `opp-${i + 1}`,
        role: "OPP" as const,
        label: p.label,
        x: Math.round(100 - p.x),
        y: Math.round(100 - p.y),
      })));
    } else setOppPieces([]);
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
    setBoardDirty(true);
  }

  function removeOpp(id: string) {
    setOppPieces((ops) => ops.filter((o) => o.id !== id));
  }

  function onMove(piece: Piece) {
    stopPlayback();
    setEdits((m) => new Map(m).set(piece.id, { x: piece.x, y: piece.y }));
    setBoardDirty(true);
  }

  // ---- the paint ----
  async function drawItUp() {
    if (painting) return; // Enter key + button can both fire — one paint at a time
    const text = scenarioText.trim();
    if (!text) {
      setError('Describe the situation — e.g. "they press us high on goal kicks, show me how we build out".');
      return;
    }
    setError("");
    stopPlayback();

    if (!live) {
      // DEMO: paint the closest authored picture, clearly labeled
      const matched = scenarioFromText(text);
      const sid: ScenarioId = matched ?? "midblock";
      const sDef = SCENARIOS.find((s) => s.id === sid)!;
      const pic = applyScenario(formation, sid);
      const m = oppPieces.length
        ? matchupCallouts(pic, oppPieces, sid)
        : { callouts: [] as MatchupCallout[], ballPath: [] as { x: number; y: number }[] };
      const anchor = SCENARIO_BALL[sid];
      setGhosts(pieces.map((p) => ({ ...p })));
      setEdits(new Map());
      setBoardDirty(false);
      setPaint({
        demo: true,
        headline: `${sDef.emoji} ${sDef.name} — authored demo picture${matched ? "" : " (closest match)"}`,
        rationale: `${sDef.points[0]} ${sDef.points[1] ?? ""}`,
        positions: pic.map((p) => ({ label: p.label, x: Math.round(p.x), y: Math.round(p.y) })),
        ballPath: m.ballPath.length >= 2 ? m.ballPath : anchor ? [anchor] : [],
        callouts: m.callouts.map((c) => ({ kind: c.kind, x: c.x, y: c.y, text: c.text })),
      });
      return;
    }

    // LIVE: verified facts in, hard validation out (one silent retry on a bad paint)
    setPainting(true);
    const seq = ++paintSeq.current; // clearPaint() bumps this — a stale response must not land
    const facts = geometryFacts(pieces, oppPieces);
    const body = {
      format,
      formation: formation.name,
      scenario: text,
      board: pieces.map(({ label, role, x, y }) => ({ label, role, x: Math.round(x), y: Math.round(y) })),
      opponents: oppPieces.map(({ label, x, y }) => ({ label, x: Math.round(x), y: Math.round(y) })),
      opponent,
      facts,
      depth,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await sendJSON<{ picture: PaintedPicture; award: AwardResult; readsLeft: number }>("/api/board/scenario", body);
        if (seq !== paintSeq.current) return; // board switched away mid-flight — discard
        const byLabel = new Map(r.picture.positions.map((p) => [p.label, p]));
        const matchedCount = formation.pieces.filter((p) => byLabel.has(p.label)).length;
        if (matchedCount < Math.ceil(formation.pieces.length * 0.8)) throw new Error("incomplete-paint");
        // geometry guardrail: clamp + de-overlap the painted picture
        const merged = formation.pieces.map((p) => {
          const t = byLabel.get(p.label);
          return t ? { ...p, x: clampG(t.x), y: clampG(t.y) } : { ...p };
        });
        resolveCollisions(merged);
        setGhosts(pieces.map((p) => ({ ...p })));
        setEdits(new Map());
        setBoardDirty(false);
        setPaint({
          ...r.picture,
          positions: merged.map((p) => ({ label: p.label, x: p.x, y: p.y })),
          ballPath: r.picture.ballPath.map((p) => ({ x: clampG(p.x), y: clampG(p.y) })),
        });
        celebrate(r.award);
        setPainting(false);
        return;
      } catch (e) {
        if (seq !== paintSeq.current) return; // board switched away mid-flight — discard
        const msg = e instanceof Error ? e.message : "Paint failed";
        if (msg === "incomplete-paint" && attempt === 0) continue; // one silent retry
        setError(msg === "incomplete-paint" ? "The engine returned an incomplete picture twice — try rewording the scenario." : msg);
        setPainting(false);
        return;
      }
    }
  }

  // animate the ball along the painted route, looping
  function playBall() {
    if (playing) { stopPlayback(); return; }
    const path = paint?.ballPath ?? [];
    if (path.length < 2) return;
    setPlaying(true);
    const cycle = () => {
      setBallPos(path[0]);
      path.forEach((wp, i) => {
        if (i > 0) timers.current.push(setTimeout(() => setBallPos(wp), 400 + i * 900));
      });
      timers.current.push(setTimeout(cycle, 400 + path.length * 900 + 1200));
    };
    cycle();
  }

  async function generateReport() {
    if (reportLoading) return;
    setReportLoading(true);
    setReportError("");
    try {
      const r = await sendJSON<{ analysis: FormationAnalysis; award: AwardResult; entryId?: number }>("/api/formation", {
        format,
        ageGroup: squadInfo?.ageGroup || (format === "7v7" ? "U9" : format === "9v9" ? "U11" : "U13"),
        style: `${squadInfo?.preferredStyle || ""} — the coach is exploring a ${formation.name}`.trim(),
        opponentNotes: [opponent, oppPieces.length ? `their on-board positions: ${oppPieces.map((o) => `${o.label}[${Math.round(o.x)},${Math.round(o.y)}]`).join(" ")}` : ""].filter(Boolean).join("; "),
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

  const CALLOUT_DOT: Record<string, string> = { press: "#ffd166", free: "#2dd47a", exploit: "#4cc9f0", danger: "#ff5d5d" };

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
                title={d.id === "quick" ? "Fastest, cheapest paint" : d.id === "standard" ? "Stronger tactical reasoning (Pro)" : "The flagship engine — maximum depth (Pro)"}
                onClick={() => pickDepth(d.id, ent?.plan === "pro")}
              >
                {d.label}{d.pro && ent?.plan !== "pro" ? " 👑" : ""}
              </button>
            ))}
          </span>
        </div>
        <div className="tabs" style={{ marginTop: 8, marginBottom: 0 }}>
          {formationsForFormat.map((f) => (
            <button key={f.id} className={`tab ${formationId === f.id ? "active" : ""}`} onClick={() => pickFormation(f.id)}>
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

      {/* the opposition: their base shape + how they play, in the coach's words */}
      <div className="card" style={{ marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap", color: "#e5484d" }}>🔴 Opposition:</span>
          <select value={oppFormationId} onChange={(e) => pickOppFormation(e.target.value)} style={{ fontSize: 12.5 }}>
            <option value="">Their formation…</option>
            {formationsForFormat.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="btn ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={addOpp} disabled={oppPieces.length >= 11}>
            + Lone marker
          </button>
          {oppPieces.length > 0 && (
            <>
              <span className="pill" style={{ fontSize: 11.5 }}>{oppPieces.length} placed</span>
              <button className="btn ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => { setOppPieces([]); setOppFormationId(""); }}>✕ Clear</button>
            </>
          )}
          <span className="small" style={{ fontWeight: 700, whiteSpace: "nowrap", marginLeft: "auto" }}>🆚 How they play:</span>
          <input
            style={{ flex: 1, minWidth: 200 }}
            value={opponent}
            placeholder="e.g. they press high, fast winger on their right, long goal kicks…"
            onChange={(e) => setOpponent(e.target.value)}
          />
        </div>
      </div>

      {/* THE box: describe the situation, the engine paints the answer */}
      <div className="card" style={{ marginBottom: 12, borderTop: "3px solid var(--accent)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <textarea
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
              value={scenarioText}
              placeholder='Describe the situation — "we are up 1-0 with 10 minutes left and they are pushing everyone forward…"'
              onChange={(e) => setScenarioText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void drawItUp(); } }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {EXAMPLE_CHIPS.map((c) => (
                <button key={c.label} className="tab" style={{ fontSize: 11.5 }} onClick={() => setScenarioText(c.text)}>{c.label}</button>
              ))}
            </div>
          </div>
          <button className="btn" style={{ minWidth: 130 }} disabled={painting} onClick={() => void drawItUp()}>
            {painting ? "Drawing it up…" : "🎨 Draw it up"}
          </button>
        </div>
        {error && (
          <div className="error-box">
            {error}
            {/Pro|upgrade/i.test(error) && (
              <button className="btn" style={{ marginLeft: 8, fontSize: 11.5, padding: "4px 10px" }} onClick={() => void goUpgrade(ent?.billingConfigured ?? false)}>👑 Go Pro</button>
            )}
          </div>
        )}
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          The engine reads your formation, the red shirts, their game plan, and verified counts from the board — then paints positions, the ball's route, and the instructions. Drag any piece afterward and hit <b>Draw it up</b> again to re-read the new picture.
        </p>
      </div>

      <div className="explorer-grid">
        <div>
          <div className="card" style={{ padding: 10 }}>
            <TacticsBoard
              pieces={pieces}
              ghosts={playing ? null : ghosts}
              onMove={onMove}
              opponents={shownOpps}
              onMoveOpp={moveOpp}
              onRemoveOpp={removeOpp}
              ball={playing ? ballPos : paint?.ballPath?.[0] ?? null}
              callouts={boardCallouts}
              suggestedPath={paint && !playing && paint.ballPath.length >= 2 ? paint.ballPath : undefined}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
              <div className="meters">
                <Meter label="Compact" value={meters.compact} color="var(--turquoise)" />
                <Meter label="Width" value={meters.width} color="var(--accent)" />
                <Meter label="Cover" value={meters.cover} color="var(--gold)" />
              </div>
              <span style={{ display: "inline-flex", gap: 8 }}>
                {paint && paint.ballPath.length >= 2 && (
                  <button className="btn" style={{ fontSize: 12 }} onClick={playBall}>
                    {playing ? "◼ Stop" : "▶ Play the ball"}
                  </button>
                )}
                <button className="btn ghost" style={{ fontSize: 12 }} onClick={clearPaint}>↺ Reset shape</button>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* the plan the engine painted */}
          {paint && (
            <div className="card fade-in" style={{ borderTop: "3px solid #4cc9f0" }}>
              {paint.demo && (
                <div className="demo-banner" style={{ marginBottom: 8 }}>🧪 <b>Demo picture</b> — the validated textbook shape nearest your description. A live engine key paints your exact scenario.</div>
              )}
              <h3 style={{ margin: 0 }}>🎯 {paint.headline}</h3>
              <p className="small" style={{ margin: "8px 0", lineHeight: 1.5 }}>{paint.rationale}</p>
              {paint.callouts.map((c, i) => (
                <div key={i} className="small" style={{ display: "flex", gap: 8, marginBottom: 6, lineHeight: 1.45 }}>
                  <span style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: 9, textAlign: "center", fontWeight: 900, fontSize: 12,
                    background: CALLOUT_DOT[c.kind], color: "#10131f",
                  }}>{i + 1}</span>
                  <span>{c.text}</span>
                </div>
              ))}
              {boardDirty && (
                <p className="small" style={{ margin: "8px 0 0", color: "var(--gold)", fontWeight: 600 }}>
                  ✋ You've moved pieces since this was painted — hit <b>🎨 Draw it up</b> to re-read the new picture.
                </p>
              )}
            </div>
          )}

          {/* how this board works */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>♟️ {formation.name} — {format}</h3>
            <ul className="points">
              <li>Pick the shape, set the red shirts, then <b>describe the situation</b> — any situation, your words.</li>
              <li>The engine paints the answer: every player placed with purpose, the ball's route, numbered instructions on the field.</li>
              <li>Counts like "3v2 in the first line" are computed from the board geometrically — the engine reasons on verified numbers, never guesses them.</li>
              <li>Drag anything, red shirts or your own, and re-draw — every paint reads the board as it stands.</li>
            </ul>
          </div>
        </div>
      </div>

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

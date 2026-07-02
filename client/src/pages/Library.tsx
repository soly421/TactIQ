import { savePlanOffline } from "../savedPlans";
import { useEffect, useMemo, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import { goUpgrade, useEntitlements } from "../entitlements";
import type { AwardResult, SessionPlan, SessionTemplate, SquadProfile } from "../types";

// Library v2. The fix for "60 of 400": one card per EXERCISE, not per
// age-band variant — 907 rows collapse to ~170 groups. Cards expand to show
// their age/complexity variants; the default view is filtered to YOUR team's
// age band; and the Session Finder wizard turns a coaching problem into a
// filtered shelf in three taps.

const PHASES = [
  { id: "all", label: "All", emoji: "✨" },
  { id: "attacking", label: "Attacking", emoji: "⚔️" },
  { id: "defending", label: "Defending", emoji: "🛡️" },
  { id: "possession", label: "Possession", emoji: "🔁" },
  { id: "transition", label: "Transition", emoji: "🌊" },
  { id: "technical", label: "Technical", emoji: "🎯" },
  { id: "set-pieces", label: "Set Pieces", emoji: "📐" },
  { id: "goalkeeping", label: "Goalkeeping", emoji: "🧤" },
  { id: "athletic", label: "Games & More", emoji: "🏟️" },
];

const BANDS = ["all", "U6-U8", "U9-U10", "U11-U12", "U13-U14", "U15-U16", "HS"];
const LEVELS = ["all", "foundation", "intermediate", "advanced"];

// "U11" -> "U11-U12", "U9" -> "U9-U10", "HS"/U17+ -> "HS"
export function bandForAge(ageGroup: string | undefined): string {
  if (!ageGroup) return "all";
  if (/hs|high/i.test(ageGroup)) return "HS";
  const n = Number(/\d+/.exec(ageGroup)?.[0]);
  if (!n) return "all";
  if (n <= 8) return "U6-U8";
  if (n <= 10) return "U9-U10";
  if (n <= 12) return "U11-U12";
  if (n <= 14) return "U13-U14";
  if (n <= 16) return "U15-U16";
  return "HS";
}

interface Group {
  topic: string;
  topicName: string;
  phase: string;
  emoji: string;
  collection: string;
  tradition?: string;
  description: string;
  variants: SessionTemplate[];
  anyUnlocked: boolean;
}

// The wizard's problem statements — a coach's words, mapped to filters.
const PROBLEMS: { label: string; phase: string; search?: string }[] = [
  { label: "We lose the ball under pressure", phase: "possession" },
  { label: "We create chances but can't finish", phase: "attacking", search: "finish" },
  { label: "We leak goals / can't defend", phase: "defending" },
  { label: "Set pieces keep hurting us", phase: "set-pieces" },
  { label: "We're slow when the ball turns over", phase: "transition" },
  { label: "First touch and technique let us down", phase: "technical" },
  { label: "I want maximum fun and touches", phase: "athletic" },
  { label: "My keeper needs work", phase: "goalkeeping" },
];

function Wizard({ defaultBand, onApply, onClose }: { defaultBand: string; onApply: (f: { band: string; phase: string; level: string; search: string }) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [band, setBand] = useState(defaultBand === "all" ? "U11-U12" : defaultBand);
  const [problem, setProblem] = useState(PROBLEMS[0]);

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="card wizard" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>🪄 Session Finder</h2>
          <button className="tab" onClick={onClose}>✕</button>
        </div>
        <div className="wiz-steps">{["Who", "What", "Level"].map((s, i) => (
          <span key={s} className={`wiz-step ${i === step ? "active" : i < step ? "done" : ""}`}>{i + 1}. {s}</span>
        ))}</div>

        {step === 0 && (
          <>
            <p className="sub" style={{ margin: "4px 0 10px" }}>Who are you coaching?</p>
            <div className="wiz-options">
              {BANDS.slice(1).map((b) => (
                <button key={b} className={`tab ${band === b ? "active" : ""}`} onClick={() => { setBand(b); setStep(1); }}>{b}</button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="sub" style={{ margin: "4px 0 10px" }}>What's the problem you want to fix?</p>
            <div className="wiz-options" style={{ flexDirection: "column", alignItems: "stretch" }}>
              {PROBLEMS.map((p) => (
                <button key={p.label} className={`suggestion ${problem.label === p.label ? "active" : ""}`} onClick={() => { setProblem(p); setStep(2); }}>
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="sub" style={{ margin: "4px 0 10px" }}>How advanced should it be?</p>
            <div className="wiz-options">
              {[
                { id: "foundation", label: "🌱 Foundations — first exposure, simple pictures" },
                { id: "intermediate", label: "⚙️ Progressions — pressure and decisions" },
                { id: "advanced", label: "🎓 Advanced — full tactical detail" },
              ].map((l) => (
                <button key={l.id} className="suggestion" onClick={() => onApply({ band, phase: problem.phase, level: l.id, search: problem.search ?? "" })}>
                  {l.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Library() {
  const { celebrate } = useGamify();
  const ent = useEntitlements();
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [collection, setCollection] = useState<"signature" | "blueprint" | "all">("all");
  const [phase, setPhase] = useState("all");
  const [band, setBand] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [teamBand, setTeamBand] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visible, setVisible] = useState(24);
  const [openPlan, setOpenPlan] = useState<{ plan: SessionPlan; entryId?: number } | null>(null);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const r = await getJSON<{ templates: SessionTemplate[] }>("/api/library");
    setTemplates(r.templates);
  }

  useEffect(() => {
    void load().catch(() => {});
    // Team-first default: open on YOUR age band, not the whole catalog.
    void getJSON<{ squad: SquadProfile | null }>("/api/team").then((r) => {
      const b = bandForAge(r.squad?.ageGroup);
      setTeamBand(b);
      if (b !== "all") setBand(b);
    }).catch(() => {});
  }, []);

  // Collapse per-band/per-complexity variants into one card per exercise/topic.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const t of templates) {
      const g = map.get(t.topic) ?? {
        topic: t.topic, topicName: t.topicName, phase: t.phase, emoji: t.emoji,
        collection: t.collection ?? "blueprint", tradition: t.tradition,
        description: t.description, variants: [], anyUnlocked: false,
      };
      g.variants.push(t);
      g.anyUnlocked = g.anyUnlocked || t.unlocked;
      map.set(t.topic, g);
    }
    return [...map.values()];
  }, [templates]);

  const list = useMemo(
    () =>
      groups.filter((g) => {
        if (collection !== "all" && g.collection !== collection) return false;
        if (phase !== "all" && g.phase !== phase) return false;
        const variantMatch = g.variants.some(
          (v) => (band === "all" || v.ageBand === band) && (level === "all" || v.complexity === level),
        );
        if (!variantMatch) return false;
        if (search && !`${g.topicName} ${g.description} ${g.tradition ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [groups, collection, phase, band, level, search],
  );

  useEffect(() => setVisible(24), [collection, phase, band, level, search]);

  async function unlock(t: SessionTemplate) {
    setError("");
    setLoadingId(t.id);
    try {
      const r = await sendJSON<{ plan: SessionPlan; award?: AwardResult; entryId?: number }>(`/api/library/${t.id}/generate`, {});
      savePlanOffline(r.plan);
      setOpenPlan({ plan: r.plan, entryId: r.entryId });
      if (r.award) celebrate(r.award);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoadingId("");
  }

  if (openPlan) {
    return (
      <div className="fade-in">
        <button className="btn ghost" style={{ marginBottom: 14 }} onClick={() => setOpenPlan(null)}>← Library</button>
        <SessionPlanView plan={openPlan.plan} entryId={openPlan.entryId} />
      </div>
    );
  }

  const variantsFor = (g: Group) =>
    g.variants
      .filter((v) => (band === "all" || v.ageBand === band) && (level === "all" || v.complexity === level))
      .sort((a, b) => a.ageBand.localeCompare(b.ageBand));

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1>The Library</h1>
          <p className="sub" style={{ maxWidth: 640 }}>
            <b>{groups.length} exercises & topics</b> ({templates.length.toLocaleString()} sessions across ages and levels) — from the
            zone curriculum and the world's academy traditions. Every unlock is built live for <i>your</i> team.
          </p>
        </div>
        <button className="btn" onClick={() => setWizardOpen(true)}>🪄 Session Finder</button>
      </div>

      {wizardOpen && (
        <Wizard
          defaultBand={teamBand}
          onClose={() => setWizardOpen(false)}
          onApply={(f) => {
            setBand(f.band);
            setPhase(f.phase);
            setLevel(f.level);
            setSearch(f.search);
            setCollection("all");
            setWizardOpen(false);
          }}
        />
      )}

      <div className="tabs" style={{ marginBottom: 8 }}>
        <button className={`tab ${collection === "all" ? "active" : ""}`} onClick={() => setCollection("all")}>✨ Everything</button>
        <button className={`tab ${collection === "signature" ? "active" : ""}`} onClick={() => setCollection("signature")}>⭐ Signature Exercises</button>
        <button className={`tab ${collection === "blueprint" ? "active" : ""}`} onClick={() => setCollection("blueprint")}>🧬 Topic Blueprints</button>
      </div>
      <div className="tabs">
        {PHASES.map((p) => (
          <button key={p.id} className={`tab ${phase === p.id ? "active" : ""}`} onClick={() => setPhase(p.id)}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      <div className="form-grid" style={{ maxWidth: 720, marginBottom: 12 }}>
        <label className="field">
          Age band {teamBand !== "all" && band === teamBand && <span className="muted small">(your team)</span>}
          <select value={band} onChange={(e) => setBand(e.target.value)}>
            {BANDS.map((b) => <option key={b} value={b}>{b === "all" ? "All ages" : b === teamBand ? `${b} — your team` : b}</option>)}
          </select>
        </label>
        <label className="field">
          Complexity
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l === "all" ? "All levels" : l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">
          Search
          <input value={search} placeholder="e.g. rondo, finishing, Brugge…" onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && (
        <div className="error-box">
          {error}
          {/upgrade|Pro/i.test(error) && (
            <button className="btn" style={{ marginLeft: 10, fontSize: 12.5, padding: "6px 12px" }} onClick={() => void goUpgrade(ent?.billingConfigured ?? false)}>
              👑 Go Pro
            </button>
          )}
        </div>
      )}
      <p className="muted small" style={{ margin: "0 0 10px" }}>
        <b>{list.length}</b> {list.length === 1 ? "exercise matches" : "exercises match"}
        {band !== "all" && ` for ${band}`}
        {ent?.libraryUnlocksLeft !== null && ent && (
          <> · <b style={{ color: ent.libraryUnlocksLeft === 0 ? "var(--red)" : "var(--gold)" }}>{ent.libraryUnlocksLeft} free unlock{ent.libraryUnlocksLeft === 1 ? "" : "s"} left this month</b></>
        )}
      </p>

      <div className="grid cols-2">
        {list.slice(0, visible).map((g) => {
          const isOpen = expanded === g.topic;
          const variants = variantsFor(g);
          return (
            <div key={g.topic} className="card clickable" onClick={() => setExpanded(isOpen ? null : g.topic)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <span className="phase-tag">
                    {g.collection === "signature" ? "⭐ " : "🧬 "}{g.emoji} {g.phase.replace("-", " ")}
                  </span>
                  <h3 style={{ margin: "3px 0 4px" }}>{g.topicName}</h3>
                  {g.tradition && <p className="small" style={{ margin: "0 0 3px", color: "var(--gold)", fontWeight: 600 }}>{g.tradition}</p>}
                  <p className="muted small" style={{ margin: 0 }}>{g.description.slice(0, 140)}{g.description.length > 140 ? "…" : ""}</p>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {g.anyUnlocked && <span className="chip" style={{ color: "var(--green)" }}>✓</span>}
                  <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>{isOpen ? "▾ close" : `${variants.length} version${variants.length === 1 ? "" : "s"} ▸`}</div>
                </div>
              </div>
              {isOpen && (
                <div className="variant-list" onClick={(e) => e.stopPropagation()}>
                  {variants.map((v) => (
                    <button key={v.id} className={`variant-btn ${v.unlocked ? "unlocked" : ""}`} disabled={loadingId === v.id} onClick={() => void unlock(v)}>
                      {loadingId === v.id
                        ? "Building…"
                        : `${v.unlocked ? "✓ " : ""}${v.ageBand} · ${v.complexity}${v.unlocked ? " — open" : " — unlock"}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > visible && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn ghost" onClick={() => setVisible((v) => v + 24)}>Show {Math.min(24, list.length - visible)} more ({list.length - visible} remaining)</button>
        </div>
      )}
    </div>
  );
}

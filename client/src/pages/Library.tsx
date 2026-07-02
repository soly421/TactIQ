import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { SessionPlanView } from "../components/SessionPlanView";
import { useGamify } from "../components/Gamify";
import type { AwardResult, School, SessionPlan, SessionTemplate } from "../types";

const FORMATS = ["all", "7v7", "9v9", "11v11", "HS"];

export function Library() {
  const { celebrate } = useGamify();
  const [schools, setSchools] = useState<School[]>([]);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [school, setSchool] = useState("all");
  const [format, setFormat] = useState("all");
  const [openPlan, setOpenPlan] = useState<SessionPlan | null>(null);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const r = await getJSON<{ schools: School[]; templates: SessionTemplate[] }>("/api/library");
    setSchools(r.schools);
    setTemplates(r.templates);
  }

  useEffect(() => {
    void load().catch(() => {});
  }, []);

  async function unlock(t: SessionTemplate) {
    setError("");
    setLoadingId(t.id);
    try {
      const r = await sendJSON<{ plan: SessionPlan; award?: AwardResult; cached?: boolean }>(`/api/library/${t.id}/generate`, {});
      setOpenPlan(r.plan);
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
        <SessionPlanView plan={openPlan} />
      </div>
    );
  }

  const list = templates.filter((t) => (school === "all" || t.school === school) && (format === "all" || t.format === format));
  const activeSchool = schools.find((s) => s.id === school);

  return (
    <div className="fade-in">
      <h1>The Library</h1>
      <p className="sub">
        Sessions from the world's schools of thought — Spain to Amsterdam to São Paulo to Friday-night lights. Unlock any template
        and TactIQ builds it in full, visualized and adapted to your team. Every session you create joins your library.
      </p>

      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${school === "all" ? "active" : ""}`} onClick={() => setSchool("all")}>All Schools</button>
        {schools.map((s) => (
          <button key={s.id} className={`tab ${school === s.id ? "active" : ""}`} onClick={() => setSchool(s.id)}>
            {s.emoji} {s.name.split(" ")[0]}
          </button>
        ))}
      </div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        {FORMATS.map((f) => (
          <button key={f} className={`tab ${format === f ? "active" : ""}`} onClick={() => setFormat(f)}>
            {f === "all" ? "All Formats" : f === "HS" ? "High School" : `${f} · ${f === "11v11" ? "Zone 2" : "Zone 1"}`}
          </button>
        ))}
      </div>

      {activeSchool && (
        <div className="hero" style={{ padding: 18, marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{activeSchool.emoji} {activeSchool.name}</h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>{activeSchool.description}</p>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}

      <div className="grid cols-2">
        {list.map((t) => {
          const s = schools.find((x) => x.id === t.school);
          return (
            <div key={t.id} className="card clickable" onClick={() => void unlock(t)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <span className="phase-tag">{s?.emoji} {s?.name}</span>
                  <h3 style={{ margin: "3px 0 4px" }}>{t.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>{t.description}</p>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="chip">{t.format} · {t.ageBand}</span>
                  <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: t.unlocked ? "var(--green)" : "var(--accent)" }}>
                    {loadingId === t.id ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> : t.unlocked ? "✓ Unlocked" : "Unlock →"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <p className="muted">No sessions match those filters yet.</p>}
    </div>
  );
}

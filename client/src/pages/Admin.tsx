import { useEffect, useState } from "react";
import { getJSON } from "../api";

// The founder dashboard: what the business is doing, in one screen.
// Spend (is any account burning money?), acquisition (which channel works?),
// and club-sales leads (who do I call this week?). Only renders for accounts
// listed in ADMIN_EMAILS on the server — everyone else 403s before data moves.

interface Overview {
  totals: { users: number; pro: number; clubs: number; teams: number; signups7d: number };
  spend: {
    todayUsd: number;
    monthUsd: number;
    topUsers: { name: string; email: string; plan: string; calls: number; inputTokens: number; outputTokens: number; estUsd: number }[];
  };
  acquisition: { byReferral: Record<string, number>; byRole: Record<string, number> };
  leads: { name: string; email: string; clubName: string; clubSize: string; zip: string; clubInterest: boolean; createdAt: string }[];
  density: { clubs: { name: string; coaches: number }[]; zips: { zip: string; coaches: number }[] };
}

const usd = (n: number) => `$${n.toFixed(n >= 10 ? 0 : 2)}`;

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {entries.length === 0 && <p className="muted small" style={{ margin: 0 }}>No data yet.</p>}
      {entries.map(([k, n]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="small" style={{ width: 90, textTransform: "capitalize" }}>{k}</span>
          <div style={{ flex: 1, height: 8, background: "var(--card-border, #333)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(n / Math.max(1, total)) * 100}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <b className="small" style={{ width: 28, textAlign: "right" }}>{n}</b>
        </div>
      ))}
    </div>
  );
}

export function Admin() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<Overview>("/api/admin/overview").then(setData).catch((e) => setError(e instanceof Error ? e.message : "Not authorized"));
  }, []);

  if (error) return <div className="fade-in"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="fade-in"><span className="spinner" /></div>;

  return (
    <div className="fade-in">
      <h1>Founder dashboard</h1>
      <p className="sub">Spend, acquisition, and club leads — the whole business on one screen. Costs are estimates at list token rates (slightly high by design).</p>

      <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <div><div className="v-num">{data.totals.users}</div><div className="muted small">coaches</div></div>
          <div><div className="v-num" style={{ color: "var(--gold, #c9a227)" }}>{data.totals.pro}</div><div className="muted small">pro</div></div>
          <div><div className="v-num">{data.totals.clubs}</div><div className="muted small">clubs</div></div>
          <div><div className="v-num">{data.totals.teams}</div><div className="muted small">teams</div></div>
          <div><div className="v-num" style={{ color: "var(--accent)" }}>+{data.totals.signups7d}</div><div className="muted small">signups, 7 days</div></div>
          <div><div className="v-num">{usd(data.spend.todayUsd)}</div><div className="muted small">compute today</div></div>
          <div><div className="v-num">{usd(data.spend.monthUsd)}</div><div className="muted small">compute this month</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0 }}>📞 Club leads {data.leads.some((l) => l.clubInterest) && <span className="small" style={{ color: "var(--green)" }}>— hand-raises first</span>}</h2>
        {data.leads.length === 0 && <p className="muted small" style={{ margin: 0 }}>No directors yet. Every DOC signup and licensing hand-raise lands here.</p>}
        {data.leads.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="stats-table">
              <thead><tr><th></th><th>Name</th><th>Email</th><th>Club</th><th>Size</th><th>ZIP</th><th>Signed up</th></tr></thead>
              <tbody>
                {data.leads.map((l, i) => (
                  <tr key={i}>
                    <td>{l.clubInterest ? "🔥" : ""}</td>
                    <td>{l.name}</td>
                    <td>{l.email}</td>
                    <td>{l.clubName || "—"}</td>
                    <td>{l.clubSize ? `${l.clubSize} teams` : "—"}</td>
                    <td>{l.zip || "—"}</td>
                    <td className="muted">{l.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid cols-2" style={{ alignItems: "start", marginBottom: 14 }}>
        <Breakdown title="📣 How coaches find us" data={data.acquisition.byReferral} />
        <Breakdown title="🧢 Who signs up" data={data.acquisition.byRole} />
      </div>

      <div className="grid cols-2" style={{ alignItems: "start", marginBottom: 14 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>🏟️ Club density <span className="muted small">2+ coaches, same club</span></h2>
          {data.density.clubs.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nothing yet — when several coaches name the same club, that's your next licensing call.</p>}
          {data.density.clubs.map((c) => (
            <div key={c.name} className="leader-row"><span className="name">{c.name}</span><span className="xp">{c.coaches} coaches</span></div>
          ))}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>📍 ZIP density <span className="muted small">2+ coaches, same ZIP</span></h2>
          {data.density.zips.length === 0 && <p className="muted small" style={{ margin: 0 }}>Nothing yet.</p>}
          {data.density.zips.map((z) => (
            <div key={z.zip} className="leader-row"><span className="name">{z.zip}</span><span className="xp">{z.coaches} coaches</span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>💸 Top compute spenders this month</h2>
        {data.spend.topUsers.length === 0 && <p className="muted small" style={{ margin: 0 }}>No model calls logged this month.</p>}
        {data.spend.topUsers.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="stats-table">
              <thead><tr><th>Coach</th><th>Plan</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th><th>Est. cost</th></tr></thead>
              <tbody>
                {data.spend.topUsers.map((u) => (
                  <tr key={u.email}>
                    <td>{u.name} <span className="muted small">{u.email}</span></td>
                    <td>{u.plan === "pro" ? "👑 pro" : "free"}</td>
                    <td>{u.calls}</td>
                    <td>{u.inputTokens.toLocaleString()}</td>
                    <td>{u.outputTokens.toLocaleString()}</td>
                    <td><b>{usd(u.estUsd)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          Daily fair-use ceilings: free $1/day, pro $5/day of estimated compute (COST_CEILING_FREE / COST_CEILING_PRO to change). A coach at the ceiling sees a friendly reset-tomorrow message.
        </p>
      </div>
    </div>
  );
}

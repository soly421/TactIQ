import { useState } from "react";
import { sendJSON } from "../api";
import { useEntitlements } from "../entitlements";

// The revenue page. Anchoring order matters: Club (the real business) sits
// rightmost as the premium anchor, annual is the highlighted default, and
// Free exists to make Pro look complete.

const MATRIX: { feature: string; free: string; pro: string; club: string }[] = [
  { feature: "AI engine", free: "Light / Standard Tactical", pro: "🧠 Deep Tactical (flagship)", club: "🧠 Deep Tactical" },
  { feature: "Messages per day", free: "30", pro: "300", club: "300 / coach" },
  { feature: "Coaching advisors", free: "Your staff of 3", pro: "All 16 + build your own", club: "All 16 + custom" },
  { feature: "Session Library", free: "5 unlocks / month", pro: "Unlimited", club: "Unlimited" },
  { feature: "Session Studio + animated diagrams", free: "✓", pro: "✓", club: "✓" },
  { feature: "Match Day: pre-game + debrief", free: "✓", pro: "✓", club: "✓" },
  { feature: "Live Bench (in-game adjustments)", free: "—", pro: "✓", club: "✓" },
  { feature: "Film Room", free: "1 clip / month", pro: "Unlimited", club: "Unlimited" },
  { feature: "Season periodization planner", free: "—", pro: "✓", club: "✓" },
  { feature: "Teams per account", free: "1", pro: "Up to 8", club: "Up to 8 / coach" },
  { feature: "Season memory + schedule sync", free: "✓", pro: "✓", club: "✓" },
  { feature: "Club philosophy in every AI answer", free: "—", pro: "—", club: "✓" },
  { feature: "DOC dashboard + monthly club report", free: "—", pro: "—", club: "✓" },
];

export function Pricing({ go }: { go: (tab: string) => void }) {
  const ent = useEntitlements();
  const [interval, setInterval_] = useState<"year" | "month">("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const r = await sendJSON<{ url: string }>("/api/billing/checkout", { interval });
      if (r.url) window.location.href = r.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    }
    setBusy(false);
  }

  const isPro = ent?.plan === "pro";

  return (
    <div className="fade-in">
      <h1>Plans</h1>
      <p className="sub">Start free. Upgrade when your team's season deserves the flagship engine — or license your whole club at once.</p>

      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab ${interval === "year" ? "active" : ""}`} onClick={() => setInterval_("year")}>
          Annual — save 33%
        </button>
        <button className={`tab ${interval === "month" ? "active" : ""}`} onClick={() => setInterval_("month")}>
          Monthly
        </button>
      </div>

      <div className="grid cols-3" style={{ alignItems: "stretch", marginBottom: 20 }}>
        <div className="card price-card">
          <h3>Free</h3>
          <div className="price"><b>$0</b></div>
          <p className="muted small">The full coaching loop: your team, your memory, real sessions. Forever free.</p>
          <button className="btn ghost" style={{ marginTop: "auto" }} disabled>
            {ent ? "Your current plan" : "Included"}
          </button>
        </div>

        <div className="card price-card featured">
          <div className="price-badge">MOST POPULAR</div>
          <h3>👑 Pro</h3>
          <div className="price">
            {interval === "year" ? (
              <><b>$9.99</b><span className="muted small"> /mo · billed $119.88 yearly</span></>
            ) : (
              <><b>$14.99</b><span className="muted small"> /mo</span></>
            )}
          </div>
          <p className="muted small">The flagship Deep Tactical engine on every output, all 16 advisors, unlimited Library and Film Room, Live Bench, season planner, up to 8 teams.</p>
          <button className="btn" style={{ marginTop: "auto" }} disabled={busy || isPro} onClick={() => void checkout()}>
            {isPro ? "✓ You're Pro" : busy ? "One moment…" : `Go Pro — ${interval === "year" ? "$119.88/yr" : "$14.99/mo"}`}
          </button>
        </div>

        <div className="card price-card">
          <h3>🏛️ Club</h3>
          <div className="price"><b>$10</b><span className="muted small"> /coach/mo</span></div>
          <p className="muted small">Every coach gets Pro. The DOC gets the dashboard, the monthly report, philosophy distribution, and one invoice. Volume pricing above 25 seats.</p>
          <div className="founding-offer">
            🏆 <b>Founding Club offer</b> — the first 10 clubs get <b>50% off year one</b>, a founders' badge, and a direct line to the team. Code <code>FOUNDING50</code> at checkout.
          </div>
          <button className="btn ghost" style={{ marginTop: "auto" }} onClick={() => go("community")}>
            License your club →
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h2>Everything, side by side</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="stats-table">
            <thead>
              <tr><th>Feature</th><th>Free</th><th style={{ color: "var(--gold)" }}>Pro</th><th>Club</th></tr>
            </thead>
            <tbody>
              {MATRIX.map((r) => (
                <tr key={r.feature}>
                  <td>{r.feature === "Session Library" && ent?.libraryCount ? `Session Library (${ent.libraryCount.toLocaleString()})` : r.feature}</td>
                  <td className="muted">{r.free}</td>
                  <td style={{ fontWeight: 600 }}>{r.pro}</td>
                  <td>{r.club}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Cancel anytime from Manage billing. Payments are handled by Stripe — TactIQ never sees your card. Fair-use daily build limits apply to all plans.
        </p>
      </div>
    </div>
  );
}

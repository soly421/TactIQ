// Plain-English privacy & player-data posture. Youth-sports buyers (club
// boards, DOCs, parents) read this before anything else — keep it honest.
export function Privacy() {
  return (
    <div className="fade-in" style={{ maxWidth: 760 }}>
      <h1>Privacy & player data</h1>
      <p className="sub">How TactIQ handles data — written for coaches, parents, and club boards, not lawyers.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>🧒 What we never do with player data</h2>
        <ul className="points">
          <li>We never sell data. Not player data, not coach data, not club data. Ever.</li>
          <li>We never build profiles of children. Rosters exist for one purpose: making YOUR coaching advice specific to YOUR team.</li>
          <li>We never use your team's data to train AI models, and our AI providers are contractually barred from doing so with API data.</li>
          <li>We never show one team's data to another account. Your roster, notes, and season history are private to you (club admins see coach activity counts — never player details).</li>
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>✏️ Data minimization — built in</h2>
        <ul className="points">
          <li><b>First names or initials only.</b> TactIQ is designed to work without any identifying details about minors. "Maya — best passer, left-footed" is everything the AI needs; last names, birthdays, photos, and contact details of players are neither requested nor wanted.</li>
          <li>Accounts belong to adults (coaches). Players never have accounts, log in, or interact with TactIQ.</li>
          <li>Video analyzed in the Film Room is processed as still frames extracted in your browser — the video file itself never leaves your device.</li>
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>🗄️ Where data lives and how to remove it</h2>
        <ul className="points">
          <li>Your data (team profile, roster notes, season memory, ratings) is stored in TactIQ's database and used only to generate your coaching outputs.</li>
          <li>Coaching requests are processed by our AI providers (Anthropic, OpenAI) under their zero-training API terms.</li>
          <li><b>Delete everything anytime:</b> My Team → Delete account. This permanently removes your account, roster, season history, ratings, and club membership in one action.</li>
          <li>Payment details are handled entirely by Stripe — TactIQ never sees or stores card numbers.</li>
        </ul>
      </div>

      <div className="card">
        <h2>🏛️ For clubs and boards</h2>
        <ul className="points">
          <li>Club admins (DOCs) see coach activity — sessions designed, match days run, engagement — never individual player information from another coach's roster.</li>
          <li>TactIQ collects no data directly from children and is intended for use by adults, consistent with COPPA's scope.</li>
          <li>Questions or a data request? Contact your club admin or email the TactIQ team — we answer data questions within 72 hours.</li>
        </ul>
      </div>
    </div>
  );
}

# TactIQ ⚽

**Your AI assistant coach for youth soccer** — training sessions designed and visualized in seconds, a professional match-day staff, 15 coaching minds to brainstorm with, and season-long memory of your team. Built for US youth coaches and their clubs, gamified like Robinhood.

## Features

- **Ask Coach Sam (Chat)** — your always-available assistant coach. Ask anything; attach a photo of a whiteboard, lineup, or stats screen and it reads it.
- **The Advisor Room** — 15 advisors, each faithfully embodying a real, documented coaching philosophy (positional play, Total Football, gegenpressing, the Italian zonal school, Brazilian futsal tradition, cholismo, the competitive cauldron, tactical periodization…). Plus **Build Your Own Advisor**.
- **The Library** — ⭐ **Signature Exercises**: named sessions from the two-zone curriculum and the world's academy traditions (Spain, Netherlands, Belgium, England, Germany, France, Brazil, US), each with real organization and coaching points — plus 🧬 **Topic Blueprints** covering every topic × age band × complexity. Unlock anything and TactIQ builds the full animated session adapted to *your* team.
- **The Labs** — Session Studio (animated SVG drill diagrams), Session Scan (photo of a whiteboard → digital session), Film Room (browser-side keyframe extraction → timestamped tactical analysis; video never leaves the device), Formation Lab (full 7v7/9v9/11v11 systems knowledge), Field Board (animated tactics whiteboard), Season Planner, and the Playbook.
- **Match Day** — Pre-Game briefing, Live Bench (sub-120-word sideline adjustments), Post-Game debrief that ingests pasted Veo / Trace / Wyscout / Hudl data and stat screenshots. All of it becomes game memory.
- **My Team** — season-long memory: squad, roster (first names/initials only), goals, and full activity history flow into every generation, alongside your 👍/👎 ratings (the AI learns what you like) and your club's philosophy.
- **Club mode** — DOC dashboard: coach activity, club philosophy that shapes every member's AI, session distribution with discussion threads, a **monthly club report**, and **club seat licensing** (one subscription, Pro for every coach).
- **Gamification** — XP portfolio chart, levels, streaks, badges, daily quests, club leaderboard. Free: 30 messages/day. Pro: 300/day + the Deep Tactical engine.
- **Try before signup** — generate a real animated session on the auth page, no account needed.

## Engines (cost-named tiers, two providers, automatic failover)

| Tier | Anthropic | OpenAI | Who |
|---|---|---|---|
| ⚡ Light Tactical | Claude Haiku 4.5 | gpt-5-mini | Free chat |
| 🔷 Standard Tactical | Claude Sonnet 5 | gpt-5.1 | Free visualizations |
| 🧠 Deep Tactical | Claude Fable 5 (+ Opus 4.8 fallback) | gpt-5.1 | Pro everything |

Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` — with both, calls fail over across providers automatically (`PREFERRED_PROVIDER` picks the order). Structured outputs are schema-enforced on both. Every call is logged to a token ledger for cost auditing; the static curriculum prompt is cached on Anthropic.

## Billing & accounts

Stripe subscriptions: individual Pro and per-seat **club licenses**, with a signature-verified webhook as the single authority over plan tiers. Password reset + weekly digest emails via Resend (`RESEND_API_KEY`). See `render.yaml` for the full production env checklist (persistent disk, JWT secret, Stripe, email).

## Privacy

Built for youth sports: player entries are first names/initials only, no child accounts, browser-side video processing, zero-training AI providers, one-click full deletion. See the in-app "Privacy & player data" page.

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # and/or OPENAI_API_KEY; omit both for demo mode
npm run dev                            # client :5173, server :8787
# production:
npm run build && npm start             # everything on :8787
```

## Structure

```
server/   Express + TypeScript — multi-provider engine tiers, personas grounded
          in real coaching philosophies, zone curriculum + formation systems
          knowledge, signature exercise catalog, schemas, match-day staff,
          structured season memory, gamification, Stripe billing, email digest
client/   React + Vite — Persian Nights UI, animated pitch diagrams, SSE chat
          with image upload, offline saved plans, club report
```

## Roadmap

- Video analysis Phase 2 (server-side ffmpeg pipeline, full-match upload) and Phase 3 (GPU tracking)
- Direct Veo/Trace partner API integrations
- Aggregated anonymous benchmarks across clubs
- Parent-shareable match reports
- Litestream continuous database backup

# TactIQ ⚽

**Your AI assistant coach for youth soccer** — the fintech-grade app for coach management. Training sessions designed and visualized in seconds, a professional match-day staff, 24+ coaching minds to brainstorm with, and season-long memory of your team. Built for US youth coaches, gamified like Robinhood.

## Features

- **Ask Coach Sam (Chat)** — your always-available assistant coach, front and center. Ask anything; attach a photo of a whiteboard, lineup, or stats screen and it reads it.
- **The Advisor Room** — 24 built-in advisors, each a distinct coaching-style archetype (park-the-bus, gegenpress, positional play, wing-and-cross, direct play…) with a "Good for" fit guide and format badges (7v7/9v9 Zone 1 · 11v11 Zone 2 · HS). Plus **Build Your Own Advisor**: describe a coaching mind and chat with it forever.
- **The Library** — session templates across 8 schools of thought (Spanish positional, Dutch total football, German pressing, Italian defensive craft, South American street/futsal, English direct, French athletic development, US pathway), filterable by format/zone. Unlock any template and TactIQ builds the full visualized session adapted to your team. Advisors reference the Library in their advice.
- **The Labs** — Session Studio (animated SVG drill diagrams, optional school-of-thought flavor), Formation Lab (interactive pitch + full game model), and the Playbook (Picture → Fix → Train It → Say This To Your Players).
- **Match Day** — a professional staff for game day: **Pre-Game** briefing (keys to the game, matchups, first-10-minutes script, word-for-word pregame talk, if-chasing/if-protecting plans), **Live Bench** (sub-120-word sideline adjustments), **Post-Game** debrief that ingests pasted **Veo / Trace / Wyscout / Hudl** data and stat screenshots.
- **My Team** — season-long memory: squad profile, roster notes, goals, and your full activity history flow into every generation. Includes a **coach experience setting** (new parent-coach → licensed veteran) that adapts every answer's language and depth.
- **Gamification** — XP portfolio chart, 10 levels, streaks, 14 badges, leaderboard, award toasts. Free tier: 30 messages/day. Pro: 300/day + flagship engine.

## Engine (tiered & multimodal)

| Tier | Chat | Structured visualizations |
|---|---|---|
| Free | Claude Haiku 4.5 (fast, cost-effective) | Claude Sonnet 5 |
| Pro | Claude Fable 5 (+ server-side Opus 4.8 fallback) | Claude Fable 5 |

Structured outputs (`output_config.format`) guarantee schema-valid session plans, formations, and game plans. Vision input supported in Chat and Post-Game (whiteboards, lineups, stats screenshots). Toggle the plan with the FREE/PRO chip in the header.

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # omit for demo mode
npm run dev                            # client :5173, server :8787
# production:
npm run build && npm start             # everything on :8787
```

## Structure

```
server/   Express + TypeScript — tiered Claude engines, personas, library,
          schemas, match-day staff, season memory, gamification, quotas
client/   React + Vite — orange Robinhood-style UI, XP chart, animated
          pitch diagrams, SSE chat with image upload
```

## Roadmap

- Accounts + real community leaderboard
- Season periodization planner (adaptive 12-week curricula)
- Direct Veo/Trace integrations (API-based match report ingestion)
- PDF session export & share links
- Licensed content partnerships (session libraries, coaching-education corpora)

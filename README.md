# TactIQ ⚽

**Your AI assistant coach for youth soccer** — training sessions designed and visualized in seconds, tactical guidance for your exact team, and 24 coaching minds to brainstorm with. Built for US youth coaches, gamified like a fintech app.

## Features

- **The Advisor Room** — 24 AI brainstorming advisors, each a distinct coaching-style archetype (park-the-bus, gegenpress, positional play, wing-and-cross, direct play, and 19 more). Streaming chat, personalities intact, all adapted to youth ages.
- **Session Studio** — describe a theme, get a full progressive session (warmup → technical → pressure → game) with animated SVG drill diagrams: players, cones, balls, goals, and movement arrows.
- **Formation Lab** — a formation + full game model (in/out of possession, transitions, vulnerabilities, training priorities) visualized on an interactive pitch.
- **The Playbook** — structured tactical guidance: The Picture → The Fix → Train It → Say This To Your Players.
- **My Team** — season-long memory. Your squad profile and full activity history flow into every advisor chat, session, and analysis.
- **Gamification** — XP, 10 coaching levels (Volunteer → Legend), daily streaks, badges, leaderboard. Free tier: 30 messages/day; visualizations uncapped.

## Engine

Claude **Fable 5** (`claude-fable-5`) with automatic server-side fallback to Opus 4.8, structured outputs (`output_config.format`) for guaranteed-valid session plans and formations, and SSE streaming for chat.

## Run it

```bash
npm install

# Live mode
export ANTHROPIC_API_KEY=sk-ant-...

# Dev (client on :5173 with proxy, server on :8787)
npm run dev

# Production
npm run build && npm start   # serves everything on :8787
```

No `ANTHROPIC_API_KEY`? The app runs in **demo mode** with canned responses so every screen is explorable.

## Structure

```
server/   Express + TypeScript API — Claude integration, personas, schemas,
          season memory (JSON store), gamification, usage quotas
client/   React + Vite — orange dark UI, animated pitch diagrams, SSE chat
```

## Roadmap

- Accounts + real community leaderboard
- Season periodization planner (12-week curricula that adapt week to week)
- PDF session export & share links
- Licensed content partnerships (session libraries, coaching-education corpora)
- Match-day mode: lineups, substitution planner, live tactical prompts

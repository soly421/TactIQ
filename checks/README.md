# TactIQ verification suites

Repeatable checks that every audit in the build history distilled into. Run
them before any push that touches the relevant area — they are the reason
audit findings don't recur.

## 1. Formation geometry + choreography (`check-geometry.mjs`)
Asserts every formation × scenario picture has no stacked pieces, in-bounds
coordinates, and resolvable ball choreography. 180 combinations.

## 2. Tactical principles (`validate-principles.mjs`)
Asserts each scenario obeys standard coaching doctrine — touchline press trap,
ball-side shift with weak-side tuck, box coverage on crosses, rest defense in
transition, build-up +1 with a between-lines receiver, wide-attack overload
and box arrivals — across all 20 formations.

Run both:
```bash
npm run check:formations
```

## 3. API integration suite (`integration-audit.py`)
~58 checks across every endpoint in demo mode: auth, onboarding, teams,
sessions (durations sum, demo labels, theme echo), library, formation +
depth gates, board reads, match day, season repo + delete ownership,
entitlement gates (free vs pro), quotas, admin gate, schedule, settings.

```bash
# terminal 1 — throwaway server
cd server && npm run build && DATABASE_PATH=/tmp/tactiq-check.db PORT=8819 JWT_SECRET=check node dist/index.js
# terminal 2
python3 checks/integration-audit.py
```
Two known test-shape caveats: `film room` expects `frames` (the test's 400 is
the endpoint working), and `second team gated free` requires the free user to
already own one team.

## 4. Browser sweep (`browser-sweep.mjs`)
Playwright walk of every tab, sub-mode, scenario button, and an end-to-end
session generation, asserting zero JS errors. Requires `playwright-core` and
a Chromium binary; server on :8819 with the `pro@a.com` fixture from the
integration suite.

```bash
node checks/browser-sweep.mjs
```

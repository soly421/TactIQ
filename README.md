# TactIQ

An interactive soccer tactics board for coaches, analysts, and fans. Set up
formations, drag players around a regulation pitch, sketch runs and passes,
and animate whole plays frame by frame — all in the browser, no account
needed.

## Features

- **Full tactics board** — a regulation 105m × 68m pitch with 11v11 players
  and a draggable ball.
- **Formation presets** — 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2, and 4-1-4-1,
  applied per team.
- **Drawing tools** — solid *run* arrows and dashed *pass* arrows; erase them
  individually or clear all.
- **Animated plays** — capture keyframes of player positions, then play them
  back with smooth interpolation. Frames can be reloaded, updated, and
  deleted.
- **Save & export** — persist the board to your browser (localStorage) and
  export the current view as a PNG.

## Getting started

```bash
npm install
npm run dev      # start the dev server
```

Other scripts:

```bash
npm test         # run unit tests (vitest)
npm run build    # type-check and build for production
npm run lint     # lint with oxlint
npm run preview  # serve the production build
```

## How to use

1. Pick a formation for each team, or drag players into place with the
   **Move** tool.
2. Sketch movement with the **Run** (solid) and **Pass** (dashed) tools by
   dragging on the pitch. **Erase** removes a single arrow.
3. To animate a play: position everyone, click **+ Capture frame**, move the
   players/ball to the next moment, capture again, and repeat. Press **Play**
   to watch the play unfold. Select a frame chip to reload it; **Update
   frame** overwrites the selected frame with the current positions.
4. **Save** stores the board in your browser; **Export PNG** downloads a
   snapshot image.

## Tech stack

- [React 19](https://react.dev/) + TypeScript
- [Vite](https://vite.dev/) for dev/build
- [Vitest](https://vitest.dev/) for unit tests
- Plain SVG for the board — no canvas or drawing libraries

## Project layout

```
src/
  types.ts             # domain types + pitch dimensions
  formations.ts        # formation templates and team builders
  state/board.ts       # pure reducer, interpolation, persistence
  components/Pitch.tsx # SVG pitch, drag & draw interactions
  components/Toolbar.tsx
  components/Timeline.tsx
  App.tsx              # composition, animation loop, PNG export
```

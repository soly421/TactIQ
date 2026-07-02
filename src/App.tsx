import { useEffect, useReducer, useRef, useState } from 'react';
import { Pitch } from './components/Pitch';
import { Timeline } from './components/Timeline';
import { Toolbar } from './components/Toolbar';
import {
  boardReducer,
  initialBoard,
  interpolateFrames,
  loadBoard,
  saveBoard,
} from './state/board';
import { PITCH_H, PITCH_W } from './types';
import './App.css';

const SEGMENT_MS = 900;

export default function App() {
  const [state, dispatch] = useReducer(boardReducer, undefined, () => loadBoard() ?? initialBoard());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const rafId = useRef(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  const play = () => {
    const frames = state.frames;
    if (frames.length < 2) return;
    setPlaying(true);
    dispatch({ type: 'SELECT_FRAME', index: 0 });
    const start = performance.now();
    const total = (frames.length - 1) * SEGMENT_MS;

    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= total) {
        dispatch({ type: 'SELECT_FRAME', index: frames.length - 1 });
        setPlaying(false);
        return;
      }
      const seg = Math.floor(elapsed / SEGMENT_MS);
      const t = (elapsed % SEGMENT_MS) / SEGMENT_MS;
      const { positions, ball } = interpolateFrames(frames[seg], frames[seg + 1], t);
      dispatch({ type: 'SET_POSITIONS', positions, ball });
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(rafId.current);
    setPlaying(false);
  };

  const save = () => {
    saveBoard(state);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = (PITCH_W + 60) * scale;
      canvas.height = (PITCH_H + 60) * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'tactiq-board.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  };

  const reset = () => {
    stop();
    dispatch({ type: 'RESET' });
  };

  return (
    <div className="app">
      <header>
        <h1>
          Tact<span className="accent">IQ</span>
        </h1>
        <p className="tagline">Interactive soccer tactics board</p>
        {savedAt && <span className="saved-note">Saved {savedAt}</span>}
      </header>
      <Toolbar state={state} dispatch={dispatch} onSave={save} onExport={exportPng} onReset={reset} />
      <main>
        <Pitch state={state} dispatch={dispatch} svgRef={svgRef} />
      </main>
      <Timeline state={state} dispatch={dispatch} playing={playing} onPlay={play} onStop={stop} />
    </div>
  );
}

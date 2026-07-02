import { describe, expect, it } from 'vitest';
import { formationPositions, makeTeam } from '../formations';
import { BALL_ID, PITCH_H, PITCH_W, type BoardState, type Frame } from '../types';
import {
  boardReducer,
  initialBoard,
  interpolateFrames,
  loadBoard,
  saveBoard,
} from './board';

describe('formations', () => {
  it('places 11 players per team', () => {
    expect(makeTeam('4-4-2', 'home')).toHaveLength(11);
    expect(makeTeam('4-3-3', 'away')).toHaveLength(11);
  });

  it('keeps the home team in the left half and the away team in the right half', () => {
    for (const p of formationPositions('4-2-3-1', 'home')) {
      expect(p.x).toBeLessThanOrEqual(PITCH_W / 2);
    }
    for (const p of formationPositions('4-2-3-1', 'away')) {
      expect(p.x).toBeGreaterThanOrEqual(PITCH_W / 2);
    }
  });

  it('mirrors away positions across the halfway line', () => {
    const home = formationPositions('3-5-2', 'home');
    const away = formationPositions('3-5-2', 'away');
    for (let i = 0; i < home.length; i++) {
      expect(away[i].x).toBeCloseTo(PITCH_W - home[i].x);
      expect(away[i].y).toBeCloseTo(home[i].y);
    }
  });

  it('throws on an unknown formation', () => {
    expect(() => formationPositions('9-9-9', 'home')).toThrow(/Unknown formation/);
  });
});

describe('boardReducer', () => {
  it('moves a player and clamps to the pitch', () => {
    const state = initialBoard();
    const id = state.players[0].id;
    let next = boardReducer(state, { type: 'MOVE_TOKEN', id, x: 100, y: 200 });
    expect(next.players[0]).toMatchObject({ x: 100, y: 200 });

    next = boardReducer(next, { type: 'MOVE_TOKEN', id, x: -50, y: PITCH_H + 999 });
    expect(next.players[0]).toMatchObject({ x: 0, y: PITCH_H });
  });

  it('moves the ball', () => {
    const next = boardReducer(initialBoard(), { type: 'MOVE_TOKEN', id: BALL_ID, x: 10, y: 20 });
    expect(next.ball).toEqual({ x: 10, y: 20 });
  });

  it('applies a formation to one team only', () => {
    const state = initialBoard();
    const awayBefore = state.players.filter((p) => p.team === 'away').map((p) => ({ ...p }));
    const next = boardReducer(state, { type: 'APPLY_FORMATION', team: 'home', name: '3-5-2' });

    expect(next.homeFormation).toBe('3-5-2');
    const expected = formationPositions('3-5-2', 'home');
    next.players
      .filter((p) => p.team === 'home')
      .forEach((p, i) => {
        expect(p.x).toBeCloseTo(expected[i].x);
        expect(p.y).toBeCloseTo(expected[i].y);
      });
    expect(next.players.filter((p) => p.team === 'away')).toEqual(awayBefore);
  });

  it('captures, selects and deletes frames', () => {
    let state = boardReducer(initialBoard(), { type: 'CAPTURE_FRAME' });
    expect(state.frames).toHaveLength(1);
    expect(state.activeFrame).toBe(0);

    const id = state.players[0].id;
    const originalPos = { ...state.frames[0].positions[id] };
    state = boardReducer(state, { type: 'MOVE_TOKEN', id, x: 500, y: 300 });
    // moving does NOT silently overwrite the captured frame
    expect(state.frames[0].positions[id]).toEqual(originalPos);

    state = boardReducer(state, { type: 'CAPTURE_FRAME' });
    expect(state.frames).toHaveLength(2);
    expect(state.activeFrame).toBe(1);

    // selecting frame 0 restores its stored positions
    state = boardReducer(state, { type: 'MOVE_TOKEN', id, x: 100, y: 100 });
    state = boardReducer(state, { type: 'SELECT_FRAME', index: 0 });
    expect(state.players[0]).toMatchObject(originalPos);

    // UPDATE_FRAME explicitly overwrites the selected frame
    state = boardReducer(state, { type: 'MOVE_TOKEN', id, x: 250, y: 260 });
    state = boardReducer(state, { type: 'UPDATE_FRAME' });
    expect(state.frames[0].positions[id]).toEqual({ x: 250, y: 260 });

    state = boardReducer(state, { type: 'DELETE_FRAME', index: 0 });
    expect(state.frames).toHaveLength(1);
    expect(state.activeFrame).toBe(0);
  });

  it('deleting a frame before the active one shifts the active index', () => {
    let state = initialBoard();
    state = boardReducer(state, { type: 'CAPTURE_FRAME' });
    state = boardReducer(state, { type: 'CAPTURE_FRAME' });
    state = boardReducer(state, { type: 'CAPTURE_FRAME' });
    expect(state.activeFrame).toBe(2);
    state = boardReducer(state, { type: 'DELETE_FRAME', index: 0 });
    expect(state.activeFrame).toBe(1);
  });

  it('adds, removes and clears arrows', () => {
    const arrow = { id: 'a1', kind: 'run' as const, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } };
    let state = boardReducer(initialBoard(), { type: 'ADD_ARROW', arrow });
    expect(state.arrows).toHaveLength(1);
    state = boardReducer(state, { type: 'REMOVE_ARROW', id: 'a1' });
    expect(state.arrows).toHaveLength(0);
    state = boardReducer(state, { type: 'ADD_ARROW', arrow });
    state = boardReducer(state, { type: 'CLEAR_ARROWS' });
    expect(state.arrows).toHaveLength(0);
  });
});

describe('interpolateFrames', () => {
  const frame = (x: number, ballX: number): Frame => ({
    id: `f${x}`,
    positions: { p1: { x, y: 100 } },
    ball: { x: ballX, y: 0 },
  });

  it('interpolates linearly between frames', () => {
    const { positions, ball } = interpolateFrames(frame(0, 100), frame(200, 300), 0.5);
    expect(positions.p1).toEqual({ x: 100, y: 100 });
    expect(ball).toEqual({ x: 200, y: 0 });
  });

  it('returns endpoints at t=0 and t=1', () => {
    expect(interpolateFrames(frame(0, 0), frame(200, 200), 0).positions.p1.x).toBe(0);
    expect(interpolateFrames(frame(0, 0), frame(200, 200), 1).positions.p1.x).toBe(200);
  });
});

describe('persistence', () => {
  it('round-trips the board through localStorage', () => {
    const state: BoardState = boardReducer(initialBoard(), { type: 'CAPTURE_FRAME' });
    saveBoard(state);
    const loaded = loadBoard();
    expect(loaded).not.toBeNull();
    expect(loaded!.frames).toHaveLength(1);
    expect(loaded!.players).toHaveLength(22);
  });

  it('returns null for corrupt data', () => {
    localStorage.setItem('tactiq.board.v1', '{not json');
    expect(loadBoard()).toBeNull();
  });
});

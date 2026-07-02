import { makeTeam } from '../formations';
import {
  BALL_ID,
  PITCH_H,
  PITCH_W,
  type Arrow,
  type BoardState,
  type Frame,
  type Point,
  type Team,
  type Tool,
} from '../types';

let uidCounter = 0;
export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function initialBoard(): BoardState {
  return {
    players: [...makeTeam('4-4-2', 'home'), ...makeTeam('4-3-3', 'away')],
    ball: { x: PITCH_W / 2, y: PITCH_H / 2 },
    arrows: [],
    frames: [],
    activeFrame: -1,
    tool: 'select',
    homeFormation: '4-4-2',
    awayFormation: '4-3-3',
  };
}

export type BoardAction =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'MOVE_TOKEN'; id: string; x: number; y: number }
  | { type: 'ADD_ARROW'; arrow: Arrow }
  | { type: 'REMOVE_ARROW'; id: string }
  | { type: 'CLEAR_ARROWS' }
  | { type: 'APPLY_FORMATION'; team: Team; name: string }
  | { type: 'CAPTURE_FRAME' }
  | { type: 'UPDATE_FRAME' }
  | { type: 'SELECT_FRAME'; index: number }
  | { type: 'DELETE_FRAME'; index: number }
  | { type: 'SET_POSITIONS'; positions: Record<string, Point>; ball: Point }
  | { type: 'LOAD'; state: BoardState }
  | { type: 'RESET' };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function snapshot(state: BoardState): Frame {
  const positions: Record<string, Point> = {};
  for (const p of state.players) positions[p.id] = { x: p.x, y: p.y };
  return { id: uid('frame'), positions, ball: { ...state.ball } };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool };

    case 'MOVE_TOKEN': {
      const x = clamp(action.x, 0, PITCH_W);
      const y = clamp(action.y, 0, PITCH_H);
      return action.id === BALL_ID
        ? { ...state, ball: { x, y } }
        : {
            ...state,
            players: state.players.map((p) =>
              p.id === action.id ? { ...p, x, y } : p,
            ),
          };
    }

    case 'ADD_ARROW':
      return { ...state, arrows: [...state.arrows, action.arrow] };

    case 'REMOVE_ARROW':
      return { ...state, arrows: state.arrows.filter((a) => a.id !== action.id) };

    case 'CLEAR_ARROWS':
      return { ...state, arrows: [] };

    case 'APPLY_FORMATION': {
      const fresh = makeTeam(action.name, action.team);
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.team !== action.team) return p;
          const idx = Number(p.id.split('-')[1]);
          const target = fresh[idx];
          return target ? { ...p, x: target.x, y: target.y } : p;
        }),
        homeFormation: action.team === 'home' ? action.name : state.homeFormation,
        awayFormation: action.team === 'away' ? action.name : state.awayFormation,
      };
    }

    case 'CAPTURE_FRAME': {
      const frames = [...state.frames, snapshot(state)];
      return { ...state, frames, activeFrame: frames.length - 1 };
    }

    case 'UPDATE_FRAME': {
      if (state.activeFrame < 0) return state;
      const current = snapshot(state);
      return {
        ...state,
        frames: state.frames.map((f, i) =>
          i === state.activeFrame ? { ...current, id: f.id } : f,
        ),
      };
    }

    case 'SELECT_FRAME': {
      const frame = state.frames[action.index];
      if (!frame) return state;
      return {
        ...state,
        activeFrame: action.index,
        ball: { ...frame.ball },
        players: state.players.map((p) => {
          const pos = frame.positions[p.id];
          return pos ? { ...p, x: pos.x, y: pos.y } : p;
        }),
      };
    }

    case 'DELETE_FRAME': {
      const frames = state.frames.filter((_, i) => i !== action.index);
      const activeFrame =
        state.activeFrame === action.index
          ? Math.min(state.activeFrame, frames.length - 1)
          : state.activeFrame > action.index
            ? state.activeFrame - 1
            : state.activeFrame;
      return { ...state, frames, activeFrame };
    }

    case 'SET_POSITIONS':
      return {
        ...state,
        ball: { ...action.ball },
        players: state.players.map((p) => {
          const pos = action.positions[p.id];
          return pos ? { ...p, x: pos.x, y: pos.y } : p;
        }),
      };

    case 'LOAD':
      return action.state;

    case 'RESET':
      return initialBoard();

    default:
      return state;
  }
}

/** Linear interpolation between two frames, t in [0, 1]. */
export function interpolateFrames(
  a: Frame,
  b: Frame,
  t: number,
): { positions: Record<string, Point>; ball: Point } {
  const lerp = (p: Point, q: Point): Point => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  });
  const positions: Record<string, Point> = {};
  for (const id of Object.keys(a.positions)) {
    positions[id] = b.positions[id] ? lerp(a.positions[id], b.positions[id]) : a.positions[id];
  }
  return { positions, ball: lerp(a.ball, b.ball) };
}

const STORAGE_KEY = 'tactiq.board.v1';

export function saveBoard(state: BoardState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadBoard(): BoardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardState;
    if (!Array.isArray(parsed.players) || !parsed.ball) return null;
    return { ...initialBoard(), ...parsed };
  } catch {
    return null;
  }
}

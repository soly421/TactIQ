/** Pitch dimensions in board units (1 unit = 10 cm, i.e. a 105m x 68m pitch). */
export const PITCH_W = 1050;
export const PITCH_H = 680;

export type Team = 'home' | 'away';

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  team: Team;
  number: number;
  label?: string;
  x: number;
  y: number;
}

export type ArrowKind = 'run' | 'pass';

export interface Arrow {
  id: string;
  kind: ArrowKind;
  from: Point;
  to: Point;
}

/** A keyframe: where every token stands at one moment of the play. */
export interface Frame {
  id: string;
  positions: Record<string, Point>; // token id -> position (players + ball)
  ball: Point;
}

export type Tool = 'select' | 'run' | 'pass' | 'erase';

export interface BoardState {
  players: Player[];
  ball: Point;
  arrows: Arrow[];
  frames: Frame[];
  activeFrame: number; // index into frames, -1 when no frames captured yet
  tool: Tool;
  homeFormation: string;
  awayFormation: string;
}

export const BALL_ID = '__ball__';

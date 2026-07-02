import { PITCH_W, PITCH_H, type Player, type Team } from './types';

/**
 * Formation templates as fractional coordinates for the left half of the
 * pitch, goalkeeper first. x: 0 = own goal line, 1 = halfway line.
 * y: 0 = top touchline, 1 = bottom touchline.
 */
const TEMPLATES: Record<string, Array<[number, number]>> = {
  '4-4-2': [
    [0.06, 0.5],
    [0.3, 0.15], [0.25, 0.38], [0.25, 0.62], [0.3, 0.85],
    [0.6, 0.15], [0.55, 0.38], [0.55, 0.62], [0.6, 0.85],
    [0.85, 0.38], [0.85, 0.62],
  ],
  '4-3-3': [
    [0.06, 0.5],
    [0.3, 0.15], [0.25, 0.38], [0.25, 0.62], [0.3, 0.85],
    [0.5, 0.5], [0.6, 0.3], [0.6, 0.7],
    [0.85, 0.18], [0.9, 0.5], [0.85, 0.82],
  ],
  '4-2-3-1': [
    [0.06, 0.5],
    [0.3, 0.15], [0.25, 0.38], [0.25, 0.62], [0.3, 0.85],
    [0.48, 0.38], [0.48, 0.62],
    [0.68, 0.18], [0.68, 0.5], [0.68, 0.82],
    [0.88, 0.5],
  ],
  '3-5-2': [
    [0.06, 0.5],
    [0.25, 0.28], [0.22, 0.5], [0.25, 0.72],
    [0.55, 0.08], [0.5, 0.32], [0.45, 0.5], [0.5, 0.68], [0.55, 0.92],
    [0.85, 0.38], [0.85, 0.62],
  ],
  '5-3-2': [
    [0.06, 0.5],
    [0.35, 0.1], [0.25, 0.3], [0.22, 0.5], [0.25, 0.7], [0.35, 0.9],
    [0.55, 0.28], [0.5, 0.5], [0.55, 0.72],
    [0.82, 0.38], [0.82, 0.62],
  ],
  '4-1-4-1': [
    [0.06, 0.5],
    [0.3, 0.15], [0.25, 0.38], [0.25, 0.62], [0.3, 0.85],
    [0.42, 0.5],
    [0.62, 0.12], [0.58, 0.38], [0.58, 0.62], [0.62, 0.88],
    [0.86, 0.5],
  ],
};

export const FORMATIONS = Object.keys(TEMPLATES);

/**
 * Positions for a team in a given formation. The home team defends the left
 * goal, the away team the right goal (its template is mirrored).
 */
export function formationPositions(name: string, team: Team): Array<{ x: number; y: number }> {
  const template = TEMPLATES[name];
  if (!template) throw new Error(`Unknown formation: ${name}`);
  return template.map(([fx, fy]) => {
    const x = team === 'home' ? fx * (PITCH_W / 2) : PITCH_W - fx * (PITCH_W / 2);
    return { x, y: fy * PITCH_H };
  });
}

export function makeTeam(name: string, team: Team): Player[] {
  return formationPositions(name, team).map((p, i) => ({
    id: `${team}-${i}`,
    team,
    number: i + 1,
    x: p.x,
    y: p.y,
  }));
}

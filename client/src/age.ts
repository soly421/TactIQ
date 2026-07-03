// US Soccer Player Development Initiatives: the game format is determined by
// age, not chosen. This is the single source of truth for that mapping —
// every form derives format from age instead of asking twice.
//   U6-U8 → 4v4 · U9-U10 → 7v7 · U11-U12 → 9v9 · U13+ (incl. HS) → 11v11

export type GameFormat = "4v4" | "7v7" | "9v9" | "11v11";

export function formatForAge(ageGroup: string | undefined): GameFormat | null {
  if (!ageGroup) return null;
  if (/hs|high/i.test(ageGroup)) return "11v11";
  const n = Number(/\d+/.exec(ageGroup)?.[0]);
  if (!n) return null;
  if (n <= 8) return "4v4";
  if (n <= 10) return "7v7";
  if (n <= 12) return "9v9";
  return "11v11";
}

// True when the coach's saved format disagrees with the US Soccer standard
// for their age — allowed (leagues deviate), but worth a visible note.
export function formatMismatch(ageGroup: string | undefined, format: string | undefined): GameFormat | null {
  const std = formatForAge(ageGroup);
  return std && format && std !== format ? std : null;
}

// 4v4 ages have no formations — small-sided play is about touches, spacing,
// and rotation. Formation tools show this instead of pretending otherwise.
export const NO_FORMATION_NOTE =
  "At 4v4 (U6–U8) there are no formations — US Soccer's small-sided standards are about maximum touches, spacing, and rotating every player through every spot. Explore the 7v7 shapes to see what's coming at U9.";

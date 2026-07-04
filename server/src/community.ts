// Shared week math. (The weekly-league competition layer that used to live
// here was removed with the Community tab — the club is the community now.)

// Monday 00:00 UTC of the current week — the epoch for weekly features
// (club cup-style reports, staff memo cache, curriculum themes, digests).
export function weekStart(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(d.getTime() - day * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

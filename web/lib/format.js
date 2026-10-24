// Small formatting helpers shared by the My Team screens and the lib code behind them, so one rule lives in one place.

// A finite number, else null.
export const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Projections, floors, ceilings: one decimal. Points actually scored: two decimals, like Sleeper. "—" when there is no number.
export const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
export const fmt2 = (v) => (v == null ? "—" : v.toFixed(2));

// What a saved league is called everywhere: its league name, else the team's name, else the caller's fallback.
export const leagueName = (t, fallback = "") => t?.league_name || t?.team_name || fallback;

// Rounded numbers (not strings): to a tenth, to a hundredth.
export const round1 = (v) => Math.round(v * 10) / 10;
export const round2 = (v) => Math.round(v * 100) / 100;

// A player's age in years, one decimal ("25.3"), from his birth date (a YYYY-MM-DD string); null when there is no usable date.
export function ageOn(birthDate, now = Date.now()) {
  const t = birthDate ? Date.parse(birthDate) : NaN;
  if (!Number.isFinite(t)) return null;
  const years = (now - t) / (365.25 * 24 * 3600 * 1000);
  return years > 0 && years < 80 ? years.toFixed(1) : null;
}

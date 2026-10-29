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

// A player's height as feet and inches ("5'11\""). Sleeper stores inches ("71"); older entries are already "6-1" or 6'1".
// null when there is nothing usable.
export function formatHeight(h) {
  if (h == null || h === "") return null;
  const str = String(h);
  if (str.includes("'")) return str;
  if (str.includes("-")) {
    const [ft, inch] = str.split("-");
    return `${ft}'${inch || 0}"`;
  }
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

// A redraft_rankings `notes` value as the site shows it. The model once published "BOUNCEBACK (informational only)" as a note on players
// coming off a bad game; that wording is not shown anywhere on the site (founder, Oct 27 2026), and the published rows of earlier weeks
// still carry it, so every reader of `notes` goes through here. What is left is real status ("OUT", ...), or "".
export const publicNote = (n) => String(n ?? "").replace(/BOUNCEBACK(\s*\(informational only\))?/gi, "").trim();

import { isBye } from "./bye.js";
// Small formatting helpers shared by the My Team screens and the lib code behind them, so one rule lives in one place.

// A finite number, else null.
export const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Projections, floors, ceilings: one decimal. Points actually scored: two decimals, like Sleeper. "—" when there is no number.
// (A numeric string, as some database columns arrive, is read as its number.)
const asNum = (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);
export const fmt1 = (v) => (num(asNum(v)) == null ? "—" : asNum(v).toFixed(1));
export const fmt2 = (v) => (num(asNum(v)) == null ? "—" : asNum(v).toFixed(2));

// +1.2 / −1.2 / 0.0 with a true minus sign, one decimal.
export const signed1 = (v) => {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
};

// 1 -> "1st", 22 -> "22nd", 13 -> "13th"; rounds first, so a percentile like 83.4 reads "83rd".
export function ordinal(n) {
  const k = Math.round(n);
  const v = Math.abs(k) % 100;
  return `${k}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] || "th"}`;
}

// Stripe amounts (cents) as dollars: 2500 -> "$25.00". "" when unknown.
export const money = (cents) => (cents == null ? "" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

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
// Pass the row's opponent: a team on a BYE has no status note -- the model used to publish "OUT" for bye players (Sleeper
// has no projection for them), which read as "ruled out" (Christian McCaffrey, week 8 2026). A bye is said as a bye.
export const publicNote = (n, opponent) => (isBye(opponent) ? "" : String(n ?? "").replace(/BOUNCEBACK(\s*\(informational only\))?/gi, "").trim());

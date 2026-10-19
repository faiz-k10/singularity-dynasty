// The Sunday board's league filters (app/my-team/BoardFilters.js): four rows -- league type, standing (the one-word
// win-chance reading), score (leading / trailing) and playoff odds. A league has to match one choice in every row that
// has any choice picked (OR within a row, AND across rows). Pure, tested in test/boardFilters.test.mjs.
import { leadState } from "./leadState.js";

export const TYPE_OPTIONS = [
  { id: "dynasty", label: "Dynasty" },
  { id: "keeper", label: "Keeper" },
  { id: "redraft", label: "Redraft" },
  { id: "bestball", label: "Best ball" },
  { id: "superflex", label: "Superflex" },
];
// The one-word standings, in the order they read from best to worst (labels come from MatchupPanel's standing()).
export const STANDING_OPTIONS = ["You win", "Favored", "Toss-up", "Underdog", "Out of reach", "Won", "Lost"].map((l) => ({ id: l, label: l }));
export const SCORE_OPTIONS = [
  { id: "lead", label: "Leading" },
  { id: "trail", label: "Trailing" },
  { id: "even", label: "Even" },
];
// Chance to make the playoffs, in plain bands.
export const ODDS_OPTIONS = [
  { id: "safe", label: "Safe", hint: "90%+" },
  { id: "likely", label: "Likely", hint: "65–90%" },
  { id: "bubble", label: "Bubble", hint: "35–65%" },
  { id: "longshot", label: "Long shot", hint: "under 35%" },
];

export const FILTER_GROUPS = [
  { key: "types", label: "League type", options: TYPE_OPTIONS },
  { key: "standing", label: "Win chance", options: STANDING_OPTIONS },
  { key: "score", label: "Score", options: SCORE_OPTIONS },
  { key: "odds", label: "Playoff odds", options: ODDS_OPTIONS },
];

export const emptyFilters = () => ({ types: new Set(), standing: new Set(), score: new Set(), odds: new Set() });
export const filterCount = (f) => f.types.size + f.standing.size + f.score.size + f.odds.size;

export function oddsBand(odds, settled = false) {
  if (typeof odds !== "number") return null;
  if (settled) return odds >= 0.5 ? "safe" : "longshot";
  return odds >= 0.9 ? "safe" : odds >= 0.65 ? "likely" : odds >= 0.35 ? "bubble" : "longshot";
}

// settings: the saved league settings (leagueType: "dynasty" | "keeper" | "redraft", bestBall, qbFormat); standingLabel:
// the card's one-word reading or null; myScore / oppScore: the matchup's current points (null when unknown).
export function leagueFacts({ settings = {}, standingLabel = null, myScore = null, oppScore = null, odds = null, settled = false }) {
  const types = [];
  if (settings.leagueType === "dynasty" || settings.leagueType === "keeper" || settings.leagueType === "redraft") types.push(settings.leagueType);
  if (settings.bestBall) types.push("bestball");
  if (settings.qbFormat === "Superflex") types.push("superflex");
  let score = null;
  if (typeof myScore === "number" && typeof oppScore === "number") {
    const [mine] = leadState(myScore, oppScore);
    score = mine || "even";
  }
  return { types, standing: standingLabel, score, odds: oddsBand(odds, settled) };
}

export function matchesFilters(filters, facts) {
  if (filters.types.size && !facts.types.some((t) => filters.types.has(t))) return false;
  if (filters.standing.size && !(facts.standing && filters.standing.has(facts.standing))) return false;
  if (filters.score.size && !(facts.score && filters.score.has(facts.score))) return false;
  if (filters.odds.size && !(facts.odds && filters.odds.has(facts.odds))) return false;
  return true;
}

// How many leagues carry each choice (for the numbers on the chips and to hide choices nobody has).
export function optionCounts(factsList) {
  const counts = { types: {}, standing: {}, score: {}, odds: {} };
  for (const f of factsList) {
    for (const t of f.types) counts.types[t] = (counts.types[t] || 0) + 1;
    if (f.standing) counts.standing[f.standing] = (counts.standing[f.standing] || 0) + 1;
    if (f.score) counts.score[f.score] = (counts.score[f.score] || 0) + 1;
    if (f.odds) counts.odds[f.odds] = (counts.odds[f.odds] || 0) + 1;
  }
  return counts;
}

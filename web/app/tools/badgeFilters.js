// Every badge getAchievements() can return, as a flat filter list --
// Established/Building split out of the single "confidence" key by
// variant since they're really two different filters a viewer would
// want separately, not "has any confidence tier." Shown in the filter toolbar in both normal and full-screen view
// (RankingsToolbar.js).
export const BADGE_FILTERS = [
  { id: "established", variant: "gold", label: "Established", match: (a) => a.key === "confidence" && a.variant === "gold" },
  { id: "building", variant: "silver", label: "Building", match: (a) => a.key === "confidence" && a.variant === "silver" },
  { id: "onFire", variant: "heat", label: "On Fire", match: (a) => a.key === "onFire" },
  { id: "onIce", variant: "ice", label: "On Thin Ice", match: (a) => a.key === "onIce" },
  { id: "volatile", variant: "icarus", label: "Risky Icarus", match: (a) => a.key === "volatile" },
  { id: "locked", variant: "eddy", label: "Steady Eddy", match: (a) => a.key === "locked" },
  { id: "buyLow", variant: "sprout", label: "Buy Low", match: (a) => a.key === "buyLow" },
  { id: "sellHigh", variant: "peak", label: "Sell High", match: (a) => a.key === "sellHigh" },
  { id: "smash", variant: "smash", label: "Smash Spot", match: (a) => a.key === "matchup" && a.variant === "smash" },
  { id: "tough", variant: "tough", label: "Tough Spot", match: (a) => a.key === "matchup" && a.variant === "tough" },
  { id: "hero", variant: "ball", label: "Super Hero", match: (a) => a.key === "hero" },
  { id: "eliteRole", variant: "eliteRole", label: "Elite Role", match: (a) => a.key === "eliteRole" },
  { id: "elitePlayer", variant: "elitePlayer", label: "Elite Player", match: (a) => a.key === "elitePlayer" },
  { id: "honorable", variant: "honorable", label: "Honorable", match: (a) => a.key === "honorable" },
  { id: "conArtist", variant: "menace", label: "Con Artist", match: (a) => a.key === "conArtist" },
];

// The same filters, grouped for the dropdown so it reads as a short list of themes instead of one wall of pills.
export const BADGE_GROUPS = [
  { label: "Confidence", ids: ["established", "building"] },
  { label: "Form", ids: ["onFire", "onIce", "honorable", "conArtist"] },
  { label: "Range", ids: ["volatile", "locked"] },
  { label: "Value", ids: ["buyLow", "sellHigh"] },
  { label: "Matchup", ids: ["smash", "tough"] },
  { label: "Track record", ids: ["hero"] },
  { label: "Elite at his position", ids: ["eliteRole", "elitePlayer"] },
];

// Does a row's badge list satisfy the selected filters? "or": any selected badge; "and": every selected badge.
export function matchesBadgeFilters(achievements, selectedIds, mode) {
  if (!selectedIds || selectedIds.size === 0) return true;
  const active = BADGE_FILTERS.filter((f) => selectedIds.has(f.id));
  return mode === "and"
    ? active.every((f) => achievements.some((a) => f.match(a)))
    : achievements.some((a) => active.some((f) => f.match(a)));
}

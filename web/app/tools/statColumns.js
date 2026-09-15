// The raw weekly-average component stats shown on Weekly Projection
// Rankings (as their own inline columns via RankingsTable's
// showStatColumns, and again per-stat in WeeklyDetailRow's percentile
// panel) -- its own module so the two don't import it from each other.
export const STAT_COLUMNS = [
  { key: "passing_yards", label: "Pass Yds" },
  { key: "passing_tds", label: "Pass TD" },
  { key: "passing_interceptions", label: "INT" },
  { key: "rushing_yards", label: "Rush Yds" },
  { key: "rushing_tds", label: "Rush TD" },
  { key: "receptions", label: "Rec" },
  { key: "receiving_yards", label: "Rec Yds" },
  { key: "receiving_tds", label: "Rec TD" },
];

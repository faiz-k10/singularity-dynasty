import data from "@/data/dynasty-values.json";
import { rowsFromData, scoreRows } from "./dynastyBoard";

// The Dynasty Draft Board's player rows (model/dynasty_value.R -> data/dynasty-values.json, refreshed by committing a new file).
// Server-only: the page hands the client only the rows its tier may see. Everyone sees the same TOP FREE_ROWS players
// (by the default view, Superflex / Contender), so a free visitor never gets the rest in the page.
export const FREE_ROWS = 20;

export function getDynastyRows(hasFullAccess) {
  const all = rowsFromData(data);
  if (hasFullAccess) return { rows: all, built: data.built, total: all.length };
  const ids = new Set(scoreRows(all, "sf", "contender").slice(0, FREE_ROWS).map((r) => r.id));
  return { rows: all.filter((r) => ids.has(r.id)), built: data.built, total: all.length };
}

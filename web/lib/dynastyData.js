import data from "@/data/dynasty-values.json";
import logs from "@/data/dynasty-logs.json";
import { formTrend, metaFromData, rowsFromData, scoreRows } from "./dynastyBoard";

// The Dynasty Draft Board's player rows (model/dynasty_value.R -> data/dynasty-values.json, refreshed by committing a new file).
// Server-only: the page hands the client only the rows its tier may see. Everyone sees the same TOP FREE_ROWS players
// (by the default view, Superflex / Contender), so a free visitor never gets the rest in the page.
export const FREE_ROWS = 20;

export function getDynastyRows(hasFullAccess) {
  const all = rowsFromData(data).map((r) => ({ ...r, form: formTrend(logs[r.id]?.p, r.ppg) }));
  const meta = metaFromData(data);
  if (hasFullAccess) return { rows: all, built: data.built, total: all.length, meta };
  const ids = new Set(scoreRows(all, "sf", "contender").slice(0, FREE_ROWS).map((r) => r.id));
  return { rows: all.filter((r) => ids.has(r.id)), built: data.built, total: all.length, meta };
}

// One player's last games for the profile's production timeline ({ w: [season x 100 + week], p: [points] }), only for a
// player this tier may see. Kept out of the page and read on demand (/api/dynasty-profile).
export function getDynastyProfile(id, hasFullAccess) {
  const row = getDynastyRows(hasFullAccess).rows.find((r) => r.id === id);
  return row ? { row, log: logs[id] || null } : null;
}

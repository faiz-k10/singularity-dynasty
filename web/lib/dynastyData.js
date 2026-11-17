import data from "@/data/dynasty-values.json";
import logs from "@/data/dynasty-logs.json";
import { metaFromData, rankGrid, rowsFromData, scoreRows } from "./dynastyBoard";

// The Dynasty Board's player rows (model/dynasty_value.R -> data/dynasty-values.json, refreshed by committing a new file).
// Server-only: the page hands the client only the rows its tier may see. Everyone sees the same TOP FREE_ROWS players
// (by the default view, Superflex / Contender), so a free visitor never gets the rest in the page.
export const FREE_ROWS = 20;

// the newest game the board is built from (season x 100 + week), for the page's caption: { season, week }
const newest = Math.max(0, ...Object.values(logs).flatMap((l) => l.w || []));
export const DYNASTY_THROUGH = newest ? { season: Math.floor(newest / 100), week: newest % 100 } : null;

export function getDynastyRows(hasFullAccess) {
  const base = rowsFromData(data);
  const grid = rankGrid(base); // over the whole pool, so the free slice carries true ranks too
  const all = base.map((r) => ({ ...r, ranks: grid.get(r.id) }));
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

import "server-only"; // reads Storage with the service key
import { unstable_cache } from "next/cache";
import bundledValues from "@/data/dynasty-values.json";
import bundledLogs from "@/data/dynasty-logs.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { metaFromData, rankGrid, rowsFromData, scoreRows, viewBoard } from "./dynastyBoard";
import { normalizePlayerName } from "./portfolio";

// The Dynasty Board's data. The Tuesday run (scripts/weekly-run.mjs -> model/run_dynasty.sh -> scripts/publish-dynasty.mjs) rebuilds it
// through the newest finished week and puts it in the private Storage bucket "dynasty"; the site reads it from there, cached an hour
// and refreshed on publish (tag "model-data"). The copy in web/data ships with the site and is used when Storage can't be read.
// Server-only: the page hands the client only the rows its tier may see. Everyone sees the same TOP FREE_ROWS players
// (by the default view, Superflex / Contender), so a free visitor never gets the rest in the page.
export const FREE_ROWS = 20;

async function download(name) {
  const { data, error } = await createAdminClient().storage.from("dynasty").download(name);
  if (error || !data) throw new Error(`dynasty ${name}: ${error?.message || "missing"}`);
  return JSON.parse(await data.text());
}
const cachedFiles = unstable_cache(
  async () => {
    const [values, logs] = await Promise.all([download("dynasty-values.json"), download("dynasty-logs.json")]);
    if (!Array.isArray(values.rows) || !values.rows.length) throw new Error("dynasty-values.json is empty");
    return { values, logs };
  },
  ["dynasty-files-v1"],
  { revalidate: 3600, tags: ["model-data"] }
);
// never caches a failure: a failed read uses the bundled copy for this request only
async function files() {
  try {
    return await cachedFiles();
  } catch (e) {
    console.error("[dynasty]", e?.message || e);
    return { values: bundledValues, logs: bundledLogs };
  }
}

// the raw data file (model/dynasty_value.R), for code that scores rows itself (lib/cardData.js)
export async function getDynastyData() {
  return (await files()).values;
}

// the newest game the board is built from: { season, week }
export async function getDynastyThrough() {
  const { values, logs } = await files();
  const newest = values.last_week || Math.max(0, ...Object.values(logs).flatMap((l) => l.w || []));
  return newest ? { season: Math.floor(newest / 100), week: newest % 100 } : null;
}

export async function getDynastyRows(hasFullAccess) {
  const { values: data } = await files();
  const base = rowsFromData(data);
  const grid = rankGrid(base); // over the whole pool, so the free slice carries true ranks too
  const all = base.map((r) => ({ ...r, ranks: grid.get(r.id) }));
  const meta = metaFromData(data);
  if (hasFullAccess) return { rows: all, built: data.built, total: all.length, meta };
  const ids = new Set(scoreRows(all, "sf", "contender").slice(0, FREE_ROWS).map((r) => r.id));
  return { rows: all.filter((r) => ids.has(r.id)), built: data.built, total: all.length, meta };
}

// Each player's dynasty status: his GROUP on the Dynasty Board's default view (Superflex / Contender, all positions), keyed by
// normalized name -> "Cornerstone", "Replacement", ... A player off the board (too few games, or past its end) has none.
// Shown as "Dynasty status" on Compare Simulations (founder, Nov 23 2026; replaced the age-based career stage there).
export async function getDynastyStatus() {
  const { values } = await files();
  const { L, groups } = viewBoard(rowsFromData(values), { format: "sf", mode: "contender", pos: "ALL" });
  const out = {};
  for (const g of groups) for (let i = g.a; i <= g.b; i++) out[normalizePlayerName(L[i].name)] = g.name;
  return out;
}

// One player's last games for the profile's production timeline ({ w: [season x 100 + week], p: [points] }), only for a
// player this tier may see. Kept out of the page and read on demand (/api/dynasty-profile).
export async function getDynastyProfile(id, hasFullAccess) {
  const row = (await getDynastyRows(hasFullAccess)).rows.find((r) => r.id === id);
  return row ? { row, log: (await files()).logs[id] || null } : null;
}

// Which paywall earns money? Reads the wall_hits table (migration 0040; written by app/WallTracker.js -> app/api/wall/route.js) and prints, per wall:
//
//   node --env-file=.env.local scripts/wall-report.mjs            all time
//   node --env-file=.env.local scripts/wall-report.mjs 14         the last 14 days
//
//   views    times a wall was seen (once per visitor session)        clicks   clicks toward pricing from it
//   click%   clicks / views                                          signed-in people who clicked, and how many of them are on a paid tier NOW
//
// "Upgraded" counts signed-in visitors who clicked a wall and whose profile is Explorer or Singularity today -- a rough read of which wall pushed them
// (the wall they last clicked is not tracked separately, so a person who clicked three walls counts for all three). Anonymous visitors can't be matched.
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../lib/fetchAllRows.js";

const days = Number(process.argv[2]) || null;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;

let rows;
try {
  rows = await fetchAllRows(sb, "wall_hits", "type, wall, tier, user_id, created_at", (q) => (since ? q.gte("created_at", since) : q).order("created_at").order("id"));
} catch (e) {
  console.error(`Could not read wall_hits (${e.message || e}). Run supabase/migrations/0040_wall_hits.sql in the Supabase SQL editor first.`);
  process.exit(1);
}
if (!rows.length) {
  console.log("No wall events yet" + (days ? ` in the last ${days} days` : "") + ".");
  process.exit(0);
}

const { data: profiles } = await sb.from("profiles").select("id, tier");
const paid = new Set((profiles || []).filter((p) => p.tier === "explorer" || p.tier === "singularity").map((p) => p.id));

const by = {};
for (const r of rows) {
  const w = (by[r.wall] ??= { views: 0, clicks: 0, clickers: new Set() });
  if (r.type === "view") w.views++;
  else {
    w.clicks++;
    if (r.user_id) w.clickers.add(r.user_id);
  }
}
const table = Object.entries(by)
  .map(([wall, w]) => ({
    wall,
    views: w.views,
    clicks: w.clicks,
    "click%": w.views ? ((100 * w.clicks) / w.views).toFixed(1) + "%" : "-",
    "signed-in clickers": w.clickers.size,
    upgraded: [...w.clickers].filter((id) => paid.has(id)).length,
  }))
  .sort((a, b) => b.clicks - a.clicks || b.views - a.views);
console.log(`${rows.length} events${days ? `, last ${days} days` : ""}, ${rows[0].created_at.slice(0, 10)} to ${rows.at(-1).created_at.slice(0, 10)}\n`);
console.table(table);

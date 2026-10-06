// Publisher for model/upload_player_groups.csv -> player_groups.
// Upserts every row by (season, week, player_name, kind), then removes rows of that (season, week, kind)
// that are no longer in the CSV (a player who left the pool would otherwise keep a stale label).
// Exits 2 if the table doesn't exist yet (run supabase/migrations/0035_player_groups.sql once).
// Run: node --env-file=.env.local scripts/publish-player-groups.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// write.csv() output: every text field quoted, embedded quotes doubled, no embedded newlines.
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (l) => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,)(?=,|$)/g)].map((m) => (m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2] ?? ""));
  const header = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])));
}

const rows = parseCsv(readFileSync(new URL("../../model/upload_player_groups.csv", import.meta.url), "utf8"));
if (rows.length === 0) {
  console.error("No rows parsed from CSV, aborting.");
  process.exit(1);
}
const season = Number(rows[0].season);
const week = Number(rows[0].week);
const payload = rows.map((r) => ({
  season, week, player_name: r.player_name, position: r.position, kind: r.kind, label: r.label,
  detail: r.detail ? JSON.parse(r.detail) : null,
}));
console.log(`Parsed ${payload.length} rows for season ${season} week ${week}.`);

for (let i = 0; i < payload.length; i += 500) {
  const { error } = await supabase.from("player_groups").upsert(payload.slice(i, i + 500), { onConflict: "season,week,player_name,kind" });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || /player_groups/.test(error.message || "")) {
      console.error("player_groups table not found -- run supabase/migrations/0035_player_groups.sql in the Supabase SQL editor first.");
      process.exit(2);
    }
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }
}

for (const kind of [...new Set(payload.map((p) => p.kind))]) {
  const keep = new Set(payload.filter((p) => p.kind === kind).map((p) => p.player_name));
  const { data: existing, error: readErr } = await supabase.from("player_groups").select("player_name").eq("season", season).eq("week", week).eq("kind", kind);
  if (readErr) {
    console.error("Could not read back for cleanup:", readErr.message);
    process.exit(1);
  }
  const stale = existing.map((r) => r.player_name).filter((n) => !keep.has(n));
  if (stale.length) {
    const { error } = await supabase.from("player_groups").delete().eq("season", season).eq("week", week).eq("kind", kind).in("player_name", stale);
    if (error) {
      console.error("Cleanup failed:", error.message);
      process.exit(1);
    }
    console.log(`Removed ${stale.length} stale ${kind} rows.`);
  }
  const { count } = await supabase.from("player_groups").select("*", { count: "exact", head: true }).eq("season", season).eq("week", week).eq("kind", kind);
  console.log(`Verified: player_groups wk${week} ${kind} = ${count} rows`);
}

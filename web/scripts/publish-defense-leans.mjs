// Publisher for model/upload_defense_leans.csv -> defense_leans.
// Upserts every row by (season, week, defense, position), then removes that (season, week)'s rows that are
// no longer in the CSV (a lean that faded must not keep its flag).
// Exits 2 if the table doesn't exist yet (run supabase/migrations/0036_defense_leans.sql once).
// Run: node --env-file=.env.local scripts/publish-defense-leans.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// write.csv() output: text fields quoted, numbers bare, NA as the bare token NA.
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (l) => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,)(?=,|$)/g)].map((m) => (m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2] ?? ""));
  const header = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])));
}
const num = (v) => (v === "" || v === "NA" || v == null ? null : Number(v));

const rows = parseCsv(readFileSync(new URL("../../model/upload_defense_leans.csv", import.meta.url), "utf8"));
if (rows.length === 0) {
  console.error("No rows parsed from CSV, aborting.");
  process.exit(1);
}
const season = Number(rows[0].season);
const week = Number(rows[0].week);
const payload = rows.map((r) => ({
  season, week, defense: r.defense, position: r.position, call: r.call,
  score: num(r.score), tier: num(r.tier), effect: num(r.effect), effect_sd: num(r.effect_sd),
  games: num(r.games), lean_games: num(r.lean_games), rank_now: num(r.rank_now), rank_prior: num(r.rank_prior),
  ppg_now: num(r.ppg_now), ppg_prior: num(r.ppg_prior),
}));
console.log(`Parsed ${payload.length} leans for season ${season} week ${week}.`);

const { error } = await supabase.from("defense_leans").upsert(payload, { onConflict: "season,week,defense,position" });
if (error) {
  if (error.code === "PGRST205" || error.code === "42P01" || /defense_leans/.test(error.message || "")) {
    console.error("defense_leans table not found -- run supabase/migrations/0036_defense_leans.sql in the Supabase SQL editor first.");
    process.exit(2);
  }
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

const keep = new Set(payload.map((p) => `${p.defense}|${p.position}`));
const { data: existing, error: readErr } = await supabase.from("defense_leans").select("defense, position").eq("season", season).eq("week", week);
if (readErr) {
  console.error("Could not read back for cleanup:", readErr.message);
  process.exit(1);
}
for (const r of existing.filter((e) => !keep.has(`${e.defense}|${e.position}`))) {
  const { error: delErr } = await supabase.from("defense_leans").delete().eq("season", season).eq("week", week).eq("defense", r.defense).eq("position", r.position);
  if (delErr) {
    console.error("Cleanup failed:", delErr.message);
    process.exit(1);
  }
  console.log(`Removed stale lean ${r.defense} ${r.position}.`);
}
const { count } = await supabase.from("defense_leans").select("*", { count: "exact", head: true }).eq("season", season).eq("week", week);
console.log(`Verified: defense_leans wk${week} = ${count} rows`);

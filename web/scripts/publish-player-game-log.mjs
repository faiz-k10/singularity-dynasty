// Publisher for model/upload_player_game_log.csv -> public.player_game_log
// (migration 0027). Full refresh: delete every row, then insert the CSV in
// batches. The log is ~12k rows for two seasons -- small enough to nuke
// and rebuild rather than diff.
// Run: node --env-file=.env.local scripts/publish-player-game-log.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx]])));
}

const num = (v) => (v === "" || v == null ? null : Number(v));
const bool = (v) => (v === "TRUE" || v === "true" ? true : v === "FALSE" || v === "false" ? false : null);

const csvPath = new URL("../../model/upload_player_game_log.csv", import.meta.url);
const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length === 0) {
  console.error("No rows parsed from CSV, aborting.");
  process.exit(1);
}

const payload = rows.map((r) => ({
  normalized_name: r.normalized_name,
  player_name: r.player_name,
  position: r.position || null,
  season: parseInt(r.season, 10),
  week: parseInt(r.week, 10),
  team: r.team || null,
  opponent: r.opponent || null,
  is_home: bool(r.is_home),
  won: bool(r.won),
  fantasy_points_ppr: num(r.fantasy_points_ppr),
  receptions: num(r.receptions),
  targets: num(r.targets),
  rec_yards: num(r.rec_yards),
  rush_yards: num(r.rush_yards),
  rush_att: num(r.rush_att),
  pass_yards: num(r.pass_yards),
  tds: num(r.tds),
}));

console.log(`Rebuilding player_game_log with ${payload.length} player-weeks...`);
const { error: delErr } = await supabase
  .from("player_game_log")
  .delete()
  .gte("season", 0); // match every row
if (delErr) {
  console.error("Delete failed:", delErr.message);
  process.exit(1);
}

const BATCH = 1000;
for (let i = 0; i < payload.length; i += BATCH) {
  const chunk = payload.slice(i, i + BATCH);
  const { error } = await supabase.from("player_game_log").insert(chunk);
  if (error) {
    console.error(`Insert failed at row ${i}:`, error.message);
    process.exit(1);
  }
  console.log(`  inserted ${Math.min(i + BATCH, payload.length)} / ${payload.length}`);
}
console.log("Done.");

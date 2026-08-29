// Publisher for model/upload_player_splits.csv -> public.player_splits
// (migration 0026). One row per player, upsert on player_name -- a full
// refresh each run, so rows for players who dropped out of the trailing
// two-season window are also deleted.
// Run: node --env-file=.env.local scripts/publish-player-splits.mjs
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
const int = (v) => (v === "" || v == null ? null : parseInt(v, 10));

const csvPath = new URL("../../model/upload_player_splits.csv", import.meta.url);
const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length === 0) {
  console.error("No rows parsed from CSV, aborting.");
  process.exit(1);
}

const payload = rows.map((r) => ({
  player_name: r.player_name,
  position: r.position || null,
  games: int(r.games),
  ppg: num(r.ppg),
  games_home: int(r.games_home),
  ppg_home: num(r.ppg_home),
  games_away: int(r.games_away),
  ppg_away: num(r.ppg_away),
  games_wins: int(r.games_wins),
  ppg_wins: num(r.ppg_wins),
  games_losses: int(r.games_losses),
  ppg_losses: num(r.ppg_losses),
  ppg_last4: num(r.ppg_last4),
  updated_at: new Date().toISOString(),
}));

console.log(`Upserting ${payload.length} players into player_splits...`);
const { error } = await supabase
  .from("player_splits")
  .upsert(payload, { onConflict: "player_name" });
if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

// Drop rows for players no longer in the CSV (fell out of the 2-season window).
const keep = payload.map((p) => p.player_name);
const { data: existing } = await supabase.from("player_splits").select("player_name");
const stale = (existing || []).map((r) => r.player_name).filter((n) => !keep.includes(n));
if (stale.length) {
  const { error: delErr } = await supabase.from("player_splits").delete().in("player_name", stale);
  console.log(delErr ? `Stale cleanup failed: ${delErr.message}` : `Removed ${stale.length} stale player(s).`);
}

console.log("Done.");

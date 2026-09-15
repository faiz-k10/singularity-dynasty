// Publisher for model/upload_player_simulations.csv -- UPDATES existing
// rows matched by (player_name, season, week) rather than delete+reinsert,
// since this republish is normally the same season/week that's already
// live. Also INSERTS any player present in the fresh CSV but missing from
// the table -- eligibility churns week to week (roster moves, new
// call-ups), so this isn't a one-time concern.
// Run: node --env-file=.env.local scripts/publish-player-simulations.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Minimal RFC4180-style CSV parser (quoted fields, "" as an escaped
// quote inside a field) -- tailored to exactly what write.csv() in R
// produces, no external dependency needed for a one-off script.
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

const csvPath = new URL("../../model/upload_player_simulations.csv", import.meta.url);
const rows = parseCsv(readFileSync(csvPath, "utf8"));

if (rows.length === 0) {
  console.error("No rows parsed from CSV, aborting.");
  process.exit(1);
}

const season = Number(rows[0].season);
const week = Number(rows[0].week);
console.log(`Parsed ${rows.length} rows for season ${season} week ${week}.`);

function toPayload(r) {
  return {
    team: r.team || null,
    floor: Number(r.floor),
    median: Number(r.median),
    ceiling: Number(r.ceiling),
    trend: r.trend,
    sample_confidence: r.sample_confidence,
    stat_ranges: r.stat_ranges ? JSON.parse(r.stat_ranges) : null,
    bust_pct: r.bust_pct === "" ? null : Number(r.bust_pct),
    normal_pct: r.normal_pct === "" ? null : Number(r.normal_pct),
    boom_pct: r.boom_pct === "" ? null : Number(r.boom_pct),
    // Present in upload_player_simulations.csv since migration 0020, but
    // never actually read into the payload until now -- the columns
    // existed in Supabase but stayed permanently null. wopr is receiving-
    // usage only (R's write.csv renders QB's NA as "").
    wopr: r.wopr === "" || r.wopr == null ? null : Number(r.wopr),
    epa: r.epa === "" || r.epa == null ? null : Number(r.epa),
    // Migration 0033 -- same "isolated display metric, doesn't feed the
    // simulation" treatment as wopr/epa above.
    ryoe: r.ryoe === "" || r.ryoe == null ? null : Number(r.ryoe),
    scramble_rate: r.scramble_rate === "" || r.scramble_rate == null ? null : Number(r.scramble_rate),
    play_action_rate: r.play_action_rate === "" || r.play_action_rate == null ? null : Number(r.play_action_rate),
    notes: r.notes || null,
  };
}

function toInsertPayload(r) {
  return {
    season: Number(r.season),
    week: Number(r.week),
    player_name: r.player_name,
    position: r.position,
    ...toPayload(r),
  };
}

// Bounded concurrency -- 485 sequential round trips would be slow, but
// firing all 485 at once risks overwhelming the connection pool.
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

let updated = 0;
let missing = [];
let failed = [];

await runPool(rows, 15, async (r) => {
  const { data, error } = await supabase
    .from("player_simulations")
    .update(toPayload(r))
    .eq("player_name", r.player_name)
    .eq("season", season)
    .eq("week", week)
    .select("player_name");

  if (error) {
    failed.push({ player: r.player_name, error: error.message });
  } else if (!data || data.length === 0) {
    missing.push(r.player_name);
  } else {
    updated++;
  }
});

console.log(`Updated: ${updated}`);

if (missing.length > 0) {
  const missingRows = rows.filter((r) => missing.includes(r.player_name)).map(toInsertPayload);
  const { error: insErr, data: insData } = await supabase
    .from("player_simulations")
    .insert(missingRows)
    .select("player_name");
  if (insErr) {
    console.log(`Insert failed for ${missing.length} newly-eligible player(s):`, insErr.message);
    process.exit(1);
  }
  console.log(`Inserted ${insData?.length ?? missingRows.length} newly-eligible player(s):`, missing.join(", "));
}

if (failed.length > 0) {
  console.log(`Failed: ${failed.length}`, failed.slice(0, 10));
  process.exit(1);
}

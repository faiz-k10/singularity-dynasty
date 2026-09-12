// Publisher for model/upload_redraft_rankings.csv -- UPDATES existing
// rows matched by (player_name, season, week), same reasoning as
// publish-player-simulations.mjs: this republish is the same season/week
// that's already live, just refreshed values (team-change shrinkage
// applied, plus the no-current-team players already removed by hand).
//
// best_ball_rankings is intentionally NOT published here -- Best Ball
// Rankings is sunset "for now" per CLAUDE.md, so there's no live page
// reading that table and nothing to refresh. model/projection_engine.R
// still writes upload_best_ball_rankings.csv every run (untouched, ready
// to go); when Best Ball comes back, restore the second `tables` entry
// from git history (this file, before this comment) rather than
// reinventing it.
// Run: node --env-file=.env.local scripts/publish-rankings.mjs
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

async function runPool(items, concurrency, worker) {
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
}

const tables = [
  {
    table: "redraft_rankings",
    csv: "../../model/upload_redraft_rankings.csv",
    toPayload: (r) => ({
      rank: Number(r.rank),
      team: r.team || null,
      opponent: r.opponent || null,
      projection: Number(r.projection),
      // Weekly floor/ceiling (migration 0029) -- what the Redraft
      // Rankings page actually displays now; `projection` stays as the
      // rank/sort basis and what My Team's myProjPts reads.
      floor: r.floor === "" || r.floor == null ? null : Number(r.floor),
      ceiling: r.ceiling === "" || r.ceiling == null ? null : Number(r.ceiling),
      matchup_mult: r.matchup_mult === "" ? null : Number(r.matchup_mult),
      trend: r.trend,
      sample_confidence: r.sample_confidence,
      scoring_stats: r.scoring_stats ? JSON.parse(r.scoring_stats) : null,
      notes: r.notes || null,
    }),
  },
].map((t) => ({
  ...t,
  toInsertPayload: (r) => ({
    season: Number(r.season),
    week: Number(r.week),
    player_name: r.player_name,
    position: r.position,
    ...t.toPayload(r),
  }),
}));

for (const { table, csv, toPayload, toInsertPayload } of tables) {
  const csvPath = new URL(csv, import.meta.url);
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  if (rows.length === 0) {
    console.error(`${table}: no rows parsed, skipping.`);
    continue;
  }
  const season = Number(rows[0].season);
  const week = Number(rows[0].week);
  console.log(`${table}: publishing ${rows.length} rows for season ${season} week ${week}...`);

  let updated = 0;
  const missing = [];
  const failed = [];

  await runPool(rows, 15, async (r) => {
    const { data, error } = await supabase
      .from(table)
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

  console.log(`${table}: updated ${updated}`);

  if (missing.length > 0) {
    const missingRows = rows.filter((r) => missing.includes(r.player_name)).map(toInsertPayload);
    const { error: insErr, data: insData } = await supabase.from(table).insert(missingRows).select("player_name");
    if (insErr) {
      console.log(`${table}: insert failed for ${missing.length} newly-eligible player(s):`, insErr.message);
    } else {
      console.log(`${table}: inserted ${insData?.length ?? missingRows.length} newly-eligible player(s):`, missing.join(", "));
    }
  }

  if (failed.length > 0) {
    console.log(`${table}: failed ${failed.length}`, failed.slice(0, 10));
  }
}

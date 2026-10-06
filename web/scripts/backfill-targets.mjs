// One-time backfill of WR/TE season Targets into the Player Season Simulations
// weeks that were published before Targets existed (see model/backfill_targets.R
// for how each past week is rebuilt "as of" that week).
//
//   node --env-file=.env.local scripts/backfill-targets.mjs export <export.json>
//       Saves every earlier-week WR/TE sim row's current stat_ranges (also the
//       backup to restore from) for the R script to read.
//   node --env-file=.env.local scripts/backfill-targets.mjs apply <export.json> <targets.csv>
//       Merges the R script's Targets floor/median/ceiling into each row's
//       stat_ranges (every other stat in it is left exactly as published).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [mode, ...rest] = process.argv.slice(2);

async function latestWeek() {
  const { data } = await supabase.from("player_simulations").select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1);
  return data[0];
}

if (mode === "export") {
  const [outPath] = rest;
  const latest = await latestWeek();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_simulations")
      .select("season, week, player_name, position, stat_ranges")
      .eq("season", latest.season)
      .lt("week", latest.week)
      .in("position", ["WR", "TE"])
      .order("week", { ascending: true })
      .order("player_name", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const todo = rows.filter((r) => r.stat_ranges && !r.stat_ranges.targets);
  writeFileSync(outPath, JSON.stringify(todo));
  const byWeek = {};
  for (const r of todo) byWeek[r.week] = (byWeek[r.week] || 0) + 1;
  console.log(`Exported ${todo.length} WR/TE rows without targets (season ${latest.season}, before week ${latest.week}):`, byWeek);
} else if (mode === "apply") {
  const [exportPath, csvPath] = rest;
  const existing = JSON.parse(readFileSync(exportPath, "utf8"));
  const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
  const csvRows = lines.slice(1).map((l) => {
    // write.csv output: only player_name is quoted, and it never contains a comma.
    const cells = l.split(",").map((c) => c.replace(/"/g, ""));
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
  const key = (week, name) => `${week}|${name}`;
  const byKey = new Map(existing.map((r) => [key(r.week, r.player_name), r]));

  let updated = 0;
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < csvRows.length) {
      const c = csvRows[next++];
      const row = byKey.get(key(Number(c.sim_week), c.player_name));
      if (!row) {
        failed.push(`${c.player_name} wk${c.sim_week}: not in export`);
        continue;
      }
      const targets = { floor: Number(c.t_floor), median: Number(c.t_median), ceiling: Number(c.t_ceiling) };
      if (![targets.floor, targets.median, targets.ceiling].every(Number.isFinite) || targets.floor > targets.median || targets.median > targets.ceiling) {
        failed.push(`${c.player_name} wk${c.sim_week}: bad targets ${JSON.stringify(targets)}`);
        continue;
      }
      // The write is idempotent (same merged object every time), so a transient
      // network failure is simply retried.
      let data = null;
      let error = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          ({ data, error } = await supabase
            .from("player_simulations")
            .update({ stat_ranges: { ...row.stat_ranges, targets } })
            .eq("season", row.season)
            .eq("week", row.week)
            .eq("player_name", row.player_name)
            .select("player_name"));
          if (!error) break;
        } catch (e) {
          error = e;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
      if (error || !data || data.length !== 1) failed.push(`${c.player_name} wk${c.sim_week}: ${error?.message || "no row updated"}`);
      else updated++;
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`Updated ${updated} of ${csvRows.length} rows.`);
  if (failed.length) {
    console.log(`Not updated (${failed.length}):`, failed.slice(0, 20));
    process.exit(1);
  }
} else {
  console.error("usage: backfill-targets.mjs export <out.json> | apply <export.json> <targets.csv>");
  process.exit(1);
}

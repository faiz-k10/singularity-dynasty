// One-off tool (Oct 20 2026): put an earlier week's published rows on today's method.
//
//   node --env-file=.env.local scripts/rebuild-week-history.mjs backup <dir>     save weeks 1-6 of both tables as JSON
//   node --env-file=.env.local scripts/rebuild-week-history.mjs apply <week>     after model/upload_*.csv were produced as-of that week
//
// apply: player_simulations for <week> become the rebuilt rows (rows the rebuild no longer contains are deleted);
// redraft_rankings for <week> keep everything AS PUBLISHED (median, floor, rank, OUT flags) and only the `ceiling`
// column takes the new 10%-exceed value (never for an OUT row, and never below the published median).
// The model side: Rscript -e 'source("projection_engine.R"); current_nfl_week <- function(season) W;
//   df <- project_all(); export_for_supabase(df, week = W)'  (project_all only sees games before week W).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MODEL = path.resolve(process.cwd(), "..", "model");

function parseCsv(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(h.map((n, i) => [n, r[i]])));
}
async function readAll(table, week, cols = "*") {
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).eq("season", 2026).eq("week", week).order("player_name").range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

const [mode, arg] = process.argv.slice(2);
if (mode === "backup") {
  fs.mkdirSync(arg, { recursive: true });
  for (const table of ["player_simulations", "redraft_rankings"]) {
    for (let w = 1; w <= 7; w++) {
      const rows = await readAll(table, w);
      fs.writeFileSync(path.join(arg, `${table}_wk${w}.json`), JSON.stringify(rows));
      console.log(`backed up ${table} wk${w}: ${rows.length} rows`);
    }
  }
} else if (mode === "apply") {
  const week = Number(arg);
  // 1. season simulations: publish the rebuilt CSV, then drop rows only the old run had
  const sims = parseCsv(fs.readFileSync(path.join(MODEL, "upload_player_simulations.csv"), "utf8").trim());
  if (!sims.length || sims.some((r) => Number(r.week) !== week)) throw new Error(`sim CSV is not for week ${week}`);
  const p = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/publish-player-simulations.mjs"], { encoding: "utf8" });
  console.log((p.stdout || "").split("\n").slice(0, 2).join(" | ").slice(0, 200));
  if (p.status !== 0) throw new Error("sim publish failed: " + (p.stderr || "").slice(-300));
  const keep = new Set(sims.map((r) => r.player_name));
  const live = await readAll("player_simulations", week, "player_name");
  const stale = live.filter((r) => !keep.has(r.player_name)).map((r) => r.player_name);
  for (let i = 0; i < stale.length; i += 50) {
    const { error } = await sb.from("player_simulations").delete().eq("season", 2026).eq("week", week).in("player_name", stale.slice(i, i + 50));
    if (error) throw error;
  }
  console.log(`week ${week} sims: ${sims.length} rebuilt rows, ${stale.length} stale rows removed`);
  // 2. weekly rankings: ceiling column only
  const rebuilt = parseCsv(fs.readFileSync(path.join(MODEL, "upload_redraft_rankings.csv"), "utf8").trim());
  const byKey = new Map(rebuilt.map((r) => [`${r.player_name}|${r.position}`, r]));
  const pub = await readAll("redraft_rankings", week, "player_name,position,projection,floor,ceiling");
  let changed = 0, skipped = 0;
  for (const r of pub) {
    const n = byKey.get(`${r.player_name}|${r.position}`);
    const newCeil = n ? Number(n.ceiling) : NaN;
    if (!n || !(r.ceiling > 0) || !(newCeil > 0) || r.projection == null) { skipped++; continue; }
    const ceiling = Math.round(Math.max(newCeil, r.projection) * 10) / 10;
    if (Math.abs(ceiling - r.ceiling) < 0.05) continue;
    const { error } = await sb.from("redraft_rankings").update({ ceiling }).eq("season", 2026).eq("week", week).eq("player_name", r.player_name).eq("position", r.position);
    if (error) throw error;
    changed++;
  }
  console.log(`week ${week} weekly rankings: ${changed} ceilings updated, ${skipped} left as published (OUT / not in rebuild)`);
} else {
  console.error("usage: backup <dir> | apply <week>");
  process.exit(1);
}

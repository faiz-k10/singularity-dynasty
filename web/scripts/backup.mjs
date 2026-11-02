// Backup: a copy of every table in the production database plus the model's output files that git doesn't keep, written OUTSIDE the repo to
// Website/Backups/ (next to the hand-made backups already there):
//
//   node --env-file=.env.local scripts/backup.mjs
//
//   Backups/auto-db_<stamp>/<table>.json + BACKUP-INFO.txt   every table, all rows (paged, so nothing past Supabase's 1000-row cap is lost)
//   Backups/auto-model_<stamp>.zip                           model/ files git ignores or doesn't track (CSVs, .rds results, upload_* files)
//
// Keeps the newest KEEP of each automatic kind and deletes older ones -- only folders / zips named auto-*, never the hand-made backups.
// weekly-run.mjs runs it after Tuesday's publish (never fatal). Not covered: Supabase's login accounts (passwords live in its auth system; the
// profiles table holds each account's tier and Stripe ids), Stripe's own data, and the Storage bucket of Lab share images.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../lib/fetchAllRows.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..", "..");
// BACKUP_DIR overrides where it goes (the GitHub Actions weekly run writes into its workspace and keeps the folder as a run artifact).
const OUT = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.resolve(REPO, "..", "Backups");
const KEEP = 8;

// Every table in supabase/migrations, each with a unique ordering (its primary key) so paging can't skip or repeat a row.
const TABLES = {
  profiles: ["id"], posts: ["id"], redraft_rankings: ["id"], best_ball_rankings: ["id"], draft_board: ["id"], player_simulations: ["id"],
  prospect_rankings: ["id"], player_actual_production: ["id"], saved_teams: ["id"], user_insights: ["id"], team_insights: ["id"],
  team_snapshot_history: ["id"], player_game_log: ["player_name", "season", "week"], player_archetypes: ["season", "week", "player_name"],
  player_groups: ["season", "week", "player_name", "kind"], defense_leans: ["season", "week", "defense", "position"], player_directory: ["sleeper_id"],
};

const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---- database ----
const dbDir = path.join(OUT, `auto-db_${stamp}`);
fs.mkdirSync(dbDir, { recursive: true });
const counts = [];
let failed = 0;
for (const [table, keys] of Object.entries(TABLES)) {
  try {
    const rows = await fetchAllRows(supabase, table, "*", (q) => keys.reduce((acc, k) => acc.order(k, { ascending: true }), q));
    fs.writeFileSync(path.join(dbDir, `${table}.json`), JSON.stringify(rows));
    counts.push(`  ${table.padEnd(28)} ${String(rows.length).padStart(7)}`);
  } catch (e) {
    failed++;
    counts.push(`  ${table.padEnd(28)}  FAILED (${e.message || e})`);
  }
}
const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout.trim();
fs.writeFileSync(
  path.join(dbDir, "BACKUP-INFO.txt"),
  `SINGULARITY DYNASTY - AUTOMATIC BACKUP\nTaken: ${stamp} (local time)\nCode: git commit ${commit}\n\nRows per table:\n${counts.join("\n")}\n\n` +
    "NOT in this folder: Supabase login accounts, Stripe's own data, the lab-shares Storage bucket.\n" +
    "Restore a table by upserting its JSON with the service-role key (same shape the publish scripts use).\n"
);
console.log(`database -> ${dbDir}\n${counts.join("\n")}`);

// ---- model outputs git doesn't keep ----
const list = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--ignored", "-z", "model"], { cwd: REPO, encoding: "utf8" }).stdout
  .split("\0").filter(Boolean)
  .concat(spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z", "model"], { cwd: REPO, encoding: "utf8" }).stdout.split("\0").filter(Boolean));
const files = [...new Set(list)];
const zipPath = path.join(OUT, `auto-model_${stamp}.zip`);
if (files.length) {
  const z = spawnSync("zip", ["-q", "-X", zipPath, ...files], { cwd: REPO, encoding: "utf8" });
  if (z.status !== 0) { failed++; console.log(`model zip FAILED: ${(z.stderr || "").trim()}`); }
  else console.log(`model outputs -> ${zipPath} (${files.length} files, ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB)`);
}

// ---- keep the newest KEEP of each automatic kind ----
for (const prefix of ["auto-db_", "auto-model_"]) {
  const old = fs.readdirSync(OUT).filter((n) => n.startsWith(prefix)).sort().reverse().slice(KEEP);
  for (const n of old) fs.rmSync(path.join(OUT, n), { recursive: true, force: true });
  if (old.length) console.log(`removed ${old.length} older ${prefix}* backup(s)`);
}

if (failed) {
  console.error(`\nFAILED: ${failed} part(s) of the backup did not complete (see above).`);
  process.exit(1);
}
console.log("\nDONE");

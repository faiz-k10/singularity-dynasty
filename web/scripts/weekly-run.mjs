// Weekly publish runner -- the one entry point the scheduled tasks call, so the
// order, the safety checks and the verification live in version control
// instead of in a prompt.
//
//   node --env-file=.env.local scripts/weekly-run.mjs game-data
//   node --env-file=.env.local scripts/weekly-run.mjs projections
//   node --env-file=.env.local scripts/weekly-run.mjs tuesday      (game-data, then projections only if the week is complete)
//
// game-data    model/player_game_log.R -> publish-player-game-log.mjs -> publish-actual-production.mjs
// projections  model/projection_engine.R -> publish-rankings.mjs -> publish-player-simulations.mjs
//
// Exits non-zero (and prints why) when a check fails, so a scheduled run can
// report it instead of silently publishing something wrong.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const MODEL = path.resolve(WEB, "..", "model");

const log = (...a) => console.log(...a);
function fail(msg) {
  console.error(`\nFAILED: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd, label) {
  log(`\n--- ${label} ---`);
  const r = spawnSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const tail = (r.stdout || "").trim().split("\n").slice(-6).join("\n");
  if (tail) log(tail);
  if (r.status !== 0) fail(`${label} exited with ${r.status}\n${(r.stderr || "").trim().split("\n").slice(-10).join("\n")}`);
  return r.stdout || "";
}
const node = (script, label) => run(process.execPath, ["--env-file=.env.local", `scripts/${script}`], WEB, label);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Which week is the "latest played" one and is it complete? Asked of nflreadr's
// schedule + the game-log CSV the R script just wrote: every team in a game
// that has a result must have player rows for that week.
function weekCompleteness() {
  const code = `
    suppressMessages(library(nflreadr))
    s <- as.data.frame(load_schedules(most_recent_season(roster = FALSE)))
    s <- s[!is.na(s$week) & as.Date(s$gameday) <= Sys.Date(), ]
    w <- max(s$week)
    g <- s[s$week == w, ]
    done <- g[!is.na(g$result), ]
    d <- read.csv("upload_player_game_log.csv")
    d <- d[d$season == max(s$season) & d$week == w, ]
    teams_done <- unique(c(done$home_team, done$away_team))
    missing <- setdiff(teams_done, unique(d$team))
    cat(sprintf("%d|%d|%d|%d|%s\\n", w, nrow(g), nrow(done), nrow(d), paste(missing, collapse = ",")))
  `;
  const r = spawnSync("Rscript", ["-e", code], { cwd: MODEL, encoding: "utf8" });
  if (r.status !== 0) fail(`completeness check failed: ${(r.stderr || "").slice(-300)}`);
  const [week, games, finished, rows, missing] = r.stdout.trim().split("\n").pop().split("|");
  return { week: Number(week), games: Number(games), finished: Number(finished), rows: Number(rows), missing: missing ? missing.split(",") : [] };
}

async function latestWeek(table) {
  const { data } = await supabase.from(table).select("season,week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1);
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("season", data[0].season).eq("week", data[0].week);
  return { season: data[0].season, week: data[0].week, count };
}

async function gameData() {
  run("Rscript", ["player_game_log.R"], MODEL, "Regenerate player game log (R)");
  const c = weekCompleteness();
  log(`\nWeek ${c.week}: ${c.finished}/${c.games} games final, ${c.rows} player-week rows` + (c.missing.length ? `, MISSING teams: ${c.missing.join(", ")}` : ", every finished game has rows"));
  node("publish-player-game-log.mjs", "Publish player_game_log");
  node("publish-actual-production.mjs", "Publish player_actual_production");
  const gl = await latestWeek("player_game_log");
  const ap = await latestWeek("player_actual_production");
  log(`\nVerified: player_game_log ${gl.season} wk${gl.week} = ${gl.count} rows, player_actual_production wk${ap.week} = ${ap.count} rows`);
  const complete = c.finished === c.games && c.missing.length === 0;
  return { ...c, complete };
}

async function projections() {
  const before = await latestWeek("redraft_rankings");
  run("Rscript", ["projection_engine.R"], MODEL, "Run projection engine (R)");
  // Sanity-check the CSVs before anything goes to production.
  const redraft = fs.readFileSync(path.join(MODEL, "upload_redraft_rankings.csv"), "utf8").trim().split("\n");
  const sims = fs.readFileSync(path.join(MODEL, "upload_player_simulations.csv"), "utf8").trim().split("\n");
  const rRows = redraft.length - 1;
  const sRows = sims.length - 1;
  log(`\nCSV check: redraft ${rRows} rows, sims ${sRows} rows (currently live: wk${before.week}, ${before.count} rows)`);
  if (rRows < 350) fail(`redraft CSV has only ${rRows} rows (expected 350+) -- not publishing`);
  if (sRows < 200) fail(`player simulations CSV has only ${sRows} rows (expected 200+) -- not publishing`);
  const newWeek = Number(redraft[1].split(",")[1]);
  log(`CSV week: ${newWeek}`);
  if (newWeek < before.week) fail(`CSV week ${newWeek} is older than what is live (${before.week}) -- not publishing`);
  node("publish-rankings.mjs", "Publish redraft_rankings");
  node("publish-player-simulations.mjs", "Publish player_simulations");
  const after = await latestWeek("redraft_rankings");
  const sAfter = await latestWeek("player_simulations");
  log(`\nVerified: redraft_rankings wk${after.week} = ${after.count} rows, player_simulations wk${sAfter.week} = ${sAfter.count} rows`);
  return { week: after.week };
}

const mode = process.argv[2];
log(`Weekly run: ${mode} -- ${new Date().toString()}`);
if (mode === "game-data") {
  await gameData();
} else if (mode === "projections") {
  await projections();
} else if (mode === "tuesday") {
  const c = await gameData();
  if (!c.complete) {
    fail(`Week ${c.week} is not complete (${c.finished}/${c.games} games final` + (c.missing.length ? `, no rows for ${c.missing.join(", ")}` : "") + `). Game data was published; projections were NOT run. Re-run later.`);
  }
  await projections();
} else {
  fail("usage: weekly-run.mjs game-data | projections | tuesday");
}
log("\nDONE");

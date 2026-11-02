// Weekly publish runner -- the one entry point the schedule calls (.github/workflows/weekly.yml on GitHub Actions; it also runs by hand on
// the Mac), so the order, the safety checks and the verification live in version control instead of in a prompt.
// Every run records how it went in the private Storage bucket "ops" (runs/<mode>.json: when, passed or failed, the last lines of output,
// the GitHub run link) -- /admin shows it -- and the email digest's "already sent this week" marker lives there too (digest-sent.txt).
//
//   node --env-file=.env.local scripts/weekly-run.mjs game-data
//   node --env-file=.env.local scripts/weekly-run.mjs projections
//   node --env-file=.env.local scripts/weekly-run.mjs tuesday      (game-data, then projections only if the week is complete, then the email digest and a backup)
//   node --env-file=.env.local scripts/weekly-run.mjs backup       (scripts/backup.mjs on its own)
//
// game-data    model/player_game_log.R -> publish-player-game-log.mjs -> publish-actual-production.mjs
// projections  model/projection_engine.R -> publish-rankings.mjs -> publish-player-simulations.mjs
//              then (never fatal) model/player_archetypes.R -> publish-player-archetypes.mjs
//              then (never fatal) model/player_groups.R -> publish-player-groups.mjs
//              then (never fatal) model/defense_impact.R -> publish-defense-leans.mjs  (matchup flags, display only)
//              then (never fatal) model/player_directory.R -> publish-player-directory.mjs  (names, teams, bios, headshots; Sleeper ids)
// digest       scripts/send-weekly-digest.mjs --send, once per published week (marker: ops/digest-sent.txt), only once RESEND_API_KEY and EMAIL_FROM are set; never fatal
// backup       scripts/backup.mjs: every table + the model's untracked outputs to Website/Backups/auto-* (or $BACKUP_DIR; keeps the newest 8); never fatal after Tuesday
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

const lines = [];
const log = (...a) => {
  console.log(...a);
  lines.push(...a.join(" ").split("\n"));
};
class RunFailed extends Error {}
function fail(msg) {
  throw new RunFailed(msg);
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

// The private Storage bucket for run bookkeeping (made on first use; service role only).
const OPS = "ops";
async function opsBucket() {
  const { error } = await supabase.storage.getBucket(OPS);
  if (error) await supabase.storage.createBucket(OPS, { public: false });
  return supabase.storage.from(OPS);
}
async function opsRead(name) {
  const { data } = await (await opsBucket()).download(name);
  return data ? (await data.text()).trim() : null;
}
async function opsWrite(name, text, type = "text/plain") {
  const { error } = await (await opsBucket()).upload(name, text, { contentType: type, upsert: true });
  if (error) console.error(`(could not record ${name}: ${error.message})`);
}

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
  try {
    archetypes();
  } catch (e) {
    log(`SKIPPED: archetypes threw -- ${e.message}`);
  }
  try {
    groups();
  } catch (e) {
    log(`SKIPPED: player groups threw -- ${e.message}`);
  }
  try {
    defenseLeans();
  } catch (e) {
    log(`SKIPPED: defense leans threw -- ${e.message}`);
  }
  try {
    playerDirectory();
  } catch (e) {
    log(`SKIPPED: player directory threw -- ${e.message}`);
  }
  return { week: after.week };
}

// Defense-vs-position matchup flags for the weekly rankings (display only, never a projection input):
// same never-fatal treatment as the groupings below.
function defenseLeans() {
  log("\n--- Defense leans (optional) ---");
  const r = spawnSync("Rscript", ["defense_impact.R"], { cwd: MODEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return log(`SKIPPED: defense leans failed -- ${(r.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const p = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/publish-defense-leans.mjs"], { cwd: WEB, encoding: "utf8" });
  const tail = ((p.stdout || "") + (p.stderr || "")).trim().split("\n").slice(-4).join("\n");
  log(p.status === 0 ? tail : `SKIPPED: defense leans publish failed (exit ${p.status}) -- ${tail}`);
}

// The site's own player list (replaces Sleeper's dictionary): rosters, teams and statuses change every week, so it is refreshed with
// the projections. Never fatal -- the last published directory stays in place.
function playerDirectory() {
  log("\n--- Player directory (optional) ---");
  const r = spawnSync("Rscript", ["player_directory.R"], { cwd: MODEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return log(`SKIPPED: player directory failed -- ${(r.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const p = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/publish-player-directory.mjs"], { cwd: WEB, encoding: "utf8" });
  const tail = ((p.stdout || "") + (p.stderr || "")).trim().split("\n").slice(-3).join("\n");
  log(p.status === 0 ? tail : `SKIPPED: player directory publish failed (exit ${p.status}) -- ${tail}`);
}

// Extra groupings (sustainability, career stage) -- same never-fatal treatment as archetypes below.
function groups() {
  log("\n--- Player groups (optional) ---");
  const r = spawnSync("Rscript", ["player_groups.R"], { cwd: MODEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return log(`SKIPPED: player groups failed -- ${(r.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const p = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/publish-player-groups.mjs"], { cwd: WEB, encoding: "utf8" });
  const tail = ((p.stdout || "") + (p.stderr || "")).trim().split("\n").slice(-4).join("\n");
  log(p.status === 0 ? tail : `SKIPPED: player groups publish failed (exit ${p.status}) -- ${tail}`);
}

// Player archetypes (role groups for RB/WR/TE). Deliberately NEVER fatal: the projections above are
// already published, and nothing on the site depends on archetypes yet, so a problem here (R error,
// the table not created yet) is reported and skipped instead of failing the run.
function archetypes() {
  log("\n--- Player archetypes (optional) ---");
  const r = spawnSync("Rscript", ["player_archetypes.R"], { cwd: MODEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return log(`SKIPPED: archetype assignment failed -- ${(r.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const p = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/publish-player-archetypes.mjs"], { cwd: WEB, encoding: "utf8" });
  const tail = ((p.stdout || "") + (p.stderr || "")).trim().split("\n").slice(-3).join("\n");
  log(p.status === 0 ? tail : `SKIPPED: archetype publish failed (exit ${p.status}) -- ${tail}`);
}

// The weekly "Your Players This Week" email, sent at most once per published week (a re-run of Tuesday won't email anyone twice). Does nothing
// until the sender is set up (RESEND_API_KEY + EMAIL_FROM). Never fatal.
async function digest() {
  log("\n--- email digest ---");
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return log("skipped: RESEND_API_KEY / EMAIL_FROM not set yet");
  const { season, week } = await latestWeek("redraft_rankings");
  const tag = `${season}-W${week}`;
  if ((await opsRead("digest-sent.txt")) === tag) return log(`skipped: already sent for ${tag}`);
  const r = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/send-weekly-digest.mjs", "--send"], { cwd: WEB, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const tail = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(-4).join("\n");
  if (r.status === 0) await opsWrite("digest-sent.txt", tag);
  log(r.status === 0 ? tail : `DIGEST FAILED (exit ${r.status}) -- ${tail}`);
}

// Never fatal: a failed backup is reported, the publish it follows still counts.
function backup() {
  log("\n--- backup ---");
  const r = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/backup.mjs"], { cwd: WEB, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const tail = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(-4).join("\n");
  log(r.status === 0 ? tail : `BACKUP FAILED (exit ${r.status}) -- ${tail}`);
  return r.status === 0;
}

const mode = process.argv[2];
const started = new Date();
log(`Weekly run: ${mode} -- ${started.toString()}`);
// GitHub can drop a scheduled run when it is busy, so the workflow schedules each job two or three times a day with SKIP_IF_DONE_HOURS set:
// a later trigger does nothing when this job already PASSED within that many hours (a failed one is tried again). Off for hand-started runs.
const skipHours = Number(process.env.SKIP_IF_DONE_HOURS || 0);
if (skipHours > 0) {
  const prev = JSON.parse((await opsRead(`runs/${mode}.json`).catch(() => null)) || "null");
  if (prev?.ok && Date.now() - Date.parse(prev.finished) < skipHours * 3600e3) {
    console.log(`Skipped: ${mode} already passed at ${prev.finished} (within ${skipHours} hours).`);
    process.exit(0);
  }
}
let ok = true;
try {
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
    await digest();
    backup();
  } else if (mode === "backup") {
    if (!backup()) fail("backup failed");
  } else {
    fail("usage: weekly-run.mjs game-data | projections | tuesday | backup");
  }
  log("\nDONE");
} catch (e) {
  ok = false;
  log(`\nFAILED: ${e instanceof RunFailed ? e.message : e?.stack || e}`);
}
// Record the run for /admin (never fatal). A GitHub run links back to its full log.
if (["game-data", "projections", "tuesday", "backup"].includes(mode)) {
  const gh = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  await opsWrite(
    `runs/${mode}.json`,
    JSON.stringify({ mode, ok, started: started.toISOString(), finished: new Date().toISOString(), where: gh ? "GitHub Actions" : "this Mac", url: gh, lines: lines.filter(Boolean).slice(-40) }),
    "application/json"
  ).catch(() => {});
}
process.exit(ok ? 0 : 1);

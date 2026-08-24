import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const PASSING_YARD_RATE = 0.04;
const PASSING_TD_POINTS = 4;
const INTERCEPTION_POINTS = -2;
const RUSH_RECEIVE_YARD_RATE = 0.1;
const RUSH_RECEIVE_TD_POINTS = 6;
const RECEPTION_RATE = 1; // full PPR

function computeFromStats(stats) {
  if (!stats) return null;
  let points = 0;
  const breakdown = {};
  if (stats.passing_yards != null) breakdown.passing_yards = PASSING_YARD_RATE * stats.passing_yards;
  if (stats.passing_tds != null) breakdown.passing_tds = PASSING_TD_POINTS * stats.passing_tds;
  if (stats.passing_interceptions != null) breakdown.passing_interceptions = INTERCEPTION_POINTS * stats.passing_interceptions;
  if (stats.rushing_yards != null) breakdown.rushing_yards = RUSH_RECEIVE_YARD_RATE * stats.rushing_yards;
  if (stats.rushing_tds != null) breakdown.rushing_tds = RUSH_RECEIVE_TD_POINTS * stats.rushing_tds;
  if (stats.receiving_yards != null) breakdown.receiving_yards = RUSH_RECEIVE_YARD_RATE * stats.receiving_yards;
  if (stats.receiving_tds != null) breakdown.receiving_tds = RUSH_RECEIVE_TD_POINTS * stats.receiving_tds;
  if (stats.receptions != null) breakdown.receptions = RECEPTION_RATE * stats.receptions;
  for (const v of Object.values(breakdown)) points += v;
  return { points: Math.round(points * 10) / 10, breakdown };
}

const { data: latest } = await supabase
  .from("redraft_rankings")
  .select("season, week")
  .order("season", { ascending: false })
  .order("week", { ascending: false })
  .limit(1)
  .maybeSingle();

const { data, error } = await supabase
  .from("redraft_rankings")
  .select("rank, player_name, position, projection, scoring_stats")
  .eq("season", latest.season)
  .eq("week", latest.week)
  .order("rank", { ascending: true })
  .limit(15);

if (error) {
  console.error(error);
  process.exit(1);
}

let mismatches = 0;
for (const row of data) {
  const computed = computeFromStats(row.scoring_stats);
  const diff = computed ? Math.round((computed.points - row.projection) * 10) / 10 : null;
  if (diff !== 0) mismatches++;
  console.log(
    `${row.rank}. ${row.player_name} (${row.position}) -- stored=${row.projection}, computed=${computed?.points}, diff=${diff}`
  );
  if (computed) console.log("   ", computed.breakdown);
}
console.log(`\n${mismatches} / ${data.length} rows mismatch`);

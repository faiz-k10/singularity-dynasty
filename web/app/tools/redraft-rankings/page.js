import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import { percentileRank, INVERTED_STATS } from "@/lib/statPercentiles";
import SiteHeader from "../../SiteHeader";
import ExportCsvButton from "../ExportCsvButton";
import RedraftRankingsClient from "./RedraftRankingsClient";

export const metadata = {
  title: "Weekly Projection Rankings (PPR) — Singularity Dynasty",
  description:
    "Standard weekly projection rankings for every position, refreshed weekly and adjusted for matchup and opponent-strength data. Free top-50 access for every Stargazer.",
};

const PAID_TIERS = ["explorer", "singularity"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE"];
// Flattened onto each row (see the scoring_stats spread below) so
// SortableTh/sortRows can reach them the same way as every other
// column -- sortRows compares row[sortKey] directly, no nested-path
// support, so these have to live at the top level, not buried in
// row.scoring_stats.
const STAT_COLUMN_KEYS = [
  "passing_yards", "passing_tds", "passing_interceptions",
  "rushing_yards", "rushing_tds",
  "receptions", "receiving_yards", "receiving_tds",
];
const OVERALL_COLUMN_TYPES = {
  rank: "number",
  player_name: "string",
  position: "string",
  team: "string",
  opponent: "string",
  floor: "number",
  ceiling: "number",
  notes: "string",
  ...Object.fromEntries(STAT_COLUMN_KEYS.map((k) => [k, "number"])),
};

// Position-relative heat-tint for a numeric column -- QBs score far
// higher raw totals than TEs, so a global min/max would make every QB
// look "hot" regardless of how they actually rank among their own
// position. Null-safe: rows published before migration 0029 (floor/
// ceiling didn't exist yet) carry null and are excluded from the range
// and rendered at heat 0 (formatProjection shows them as "--").
function heatByPosition(rows, col) {
  const rangeByPos = {};
  for (const r of rows) {
    if (r[col] == null) continue;
    const range = rangeByPos[r.position] || { min: Infinity, max: -Infinity };
    range.min = Math.min(range.min, r[col]);
    range.max = Math.max(range.max, r[col]);
    rangeByPos[r.position] = range;
  }
  return (r) => {
    if (r[col] == null) return 0;
    const range = rangeByPos[r.position];
    return range && range.max > range.min ? (r[col] - range.min) / (range.max - range.min) : 0;
  };
}

// Real percentile rank (not the linear min/max heat above) for each row's
// Floor/Projection/Ceiling plus the advanced usage metrics attached
// below (WOPR/Target Share/YAC Above Exp/xFP, then RYOE/Scramble Rate/
// Play-Action Rate) -- feeds WeeklyDetailRow's expanded-row percentile
// panel, where a real number ("62nd percentile") is worth showing
// alongside the plain relative heat-tint the inline columns use. Same
// percentileRank() Player Season Simulations uses
// (lib/statPercentiles.js), just against a one-value-per-player pool here
// instead of a floor/median/ceiling triple per player. The 8 raw
// scoring_stats columns (Pass Yds, Rush Yds, ...) used to be in this list
// too -- replaced by request with these usage/efficiency metrics, which
// say more about WHY a player is projected where they are than the raw
// weekly stat averages (already visible as their own inline columns).
const PERCENTILE_KEYS = [
  "floor", "projection", "ceiling",
  "wopr", "targetShare", "yacAboveExp", "avgXfp",
  "ryoe", "scrambleRate", "playActionRate",
];
function buildPoolsByPosition(rows, keys) {
  const pools = {};
  for (const r of rows) {
    const pool = (pools[r.position] ??= {});
    for (const k of keys) {
      const v = r[k];
      if (v == null) continue;
      (pool[k] ??= []).push(v);
    }
  }
  return pools;
}
function attachStatPercentiles(rows) {
  const pools = buildPoolsByPosition(rows, PERCENTILE_KEYS);
  return rows.map((r) => {
    const pool = pools[r.position] || {};
    const statPct = {};
    for (const k of PERCENTILE_KEYS) {
      const v = r[k];
      if (v == null) continue;
      statPct[k] = percentileRank(v, pool[k], INVERTED_STATS.has(k));
    }
    return { ...r, statPct };
  });
}

// WOPR (receiving usage), RYOE (RB/QB rushing efficiency), Scramble Rate/
// Play-Action Rate (QB only), and Target Share/YAC Above Exp (WR/TE
// only, median of their season floor/median/ceiling range) all come from
// Player Season Simulations' own latest published batch -- a separate
// table/pipeline from redraft_rankings, joined here by player_name only
// (no week alignment assumed; player_simulations republishes on its own
// weekly cadence, same season). Null for any player not yet in that
// table (a brand-new call-up, or before the season's first Player Sims
// publish) -- WeeklyDetailRow already renders "no data" as simply
// omitting that row, same as every other nullable metric here.
async function fetchSimsMetrics(supabase) {
  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return {};

  // ryoe/scramble_rate/play_action_rate (migration 0033) may not exist
  // yet in a given Supabase project until that migration's been run by
  // hand (this repo has no direct DDL access, see CLAUDE.md) -- selecting
  // a column that doesn't exist fails the WHOLE query, not just those
  // fields, so this falls back to the pre-0033 column set rather than
  // losing wopr/target_share/yac_above_exp too while the migration is
  // still pending.
  let { data, error } = await supabase
    .from("player_simulations")
    .select("player_name, wopr, ryoe, scramble_rate, play_action_rate, stat_ranges")
    .eq("season", latest.season)
    .eq("week", latest.week);

  if (error) {
    console.error("player_simulations: migration 0033 columns unavailable, falling back:", error.message);
    ({ data } = await supabase
      .from("player_simulations")
      .select("player_name, wopr, stat_ranges")
      .eq("season", latest.season)
      .eq("week", latest.week));
  }

  const byName = {};
  for (const r of data || []) {
    byName[r.player_name] = {
      wopr: r.wopr,
      targetShare: r.stat_ranges?.target_share?.median ?? null,
      yacAboveExp: r.stat_ranges?.yac_above_exp?.median ?? null,
      ryoe: r.ryoe ?? null,
      scrambleRate: r.scramble_rate ?? null,
      playActionRate: r.play_action_rate ?? null,
    };
  }
  return byName;
}

// xFP (ffopportunity's modeled fantasy points from that game's opportunity
// -- targets, air yards, carries, situation) is retrospective, one row
// per COMPLETED game (player_game_log, migration 0027/0028) -- there's no
// pre-game xFP for the upcoming week these rankings project. "Current
// xFP" here means this season's average xFP/game over whatever's already
// been played, a real-usage read of how a player's role has actually
// looked so far, not another projection of the week being ranked.
async function fetchSeasonXfp(supabase, season) {
  const { data } = await supabase
    .from("player_game_log")
    .select("player_name, exp_points_ppr")
    .eq("season", season);

  const sums = {};
  for (const r of data || []) {
    if (r.exp_points_ppr == null) continue;
    const s = (sums[r.player_name] ??= { total: 0, n: 0 });
    s.total += r.exp_points_ppr;
    s.n += 1;
  }
  const byName = {};
  for (const [name, s] of Object.entries(sums)) {
    byName[name] = s.total / s.n;
  }
  return byName;
}

function sortPositions(positions) {
  return [...positions].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a);
    const bi = POSITION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Stargazer sees the top 50 only; Explorer/Singularity see the full
// list — matches the pricing copy's "Weekly Projection Rankings (Top
// 50)" Stargazer bullet.
export default async function RedraftRankingsPage({ searchParams }) {
  const params = await searchParams;

  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];
  let totalCount = 0;

  if (latest) {
    const { count } = await supabase
      .from("redraft_rankings")
      .select("*", { count: "exact", head: true })
      .eq("season", latest.season)
      .eq("week", latest.week);
    totalCount = count || 0;

    let query = supabase
      .from("redraft_rankings")
      .select(
        "rank, player_name, position, team, opponent, is_home, projection, floor, ceiling, matchup_mult, trend, sample_confidence, scoring_stats, notes"
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    if (!hasFullAccess) {
      query = query.limit(50);
    }

    const { data } = await query;

    // Position-relative rank (RB1, WR23, ...) computed once from the
    // natural rank order -- stays fixed on each row even if the table is
    // later re-sorted by a different column via SortableTh.
    const positionCounters = {};
    rankings = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, ...r.scoring_stats, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });

    const [simsByName, xfpByName] = await Promise.all([
      fetchSimsMetrics(supabase),
      fetchSeasonXfp(supabase, latest.season),
    ]);
    rankings = rankings.map((r) => {
      const sims = simsByName[r.player_name] || {};
      return {
        ...r,
        wopr: sims.wopr ?? null,
        targetShare: sims.targetShare ?? null,
        yacAboveExp: sims.yacAboveExp ?? null,
        avgXfp: xfpByName[r.player_name] ?? null,
        ryoe: sims.ryoe ?? null,
        scrambleRate: sims.scrambleRate ?? null,
        playActionRate: sims.playActionRate ?? null,
      };
    });

    const floorHeatFor = heatByPosition(rankings, "floor");
    const ceilingHeatFor = heatByPosition(rankings, "ceiling");
    rankings = rankings.map((r) => ({
      ...r,
      floorHeat: floorHeatFor(r),
      ceilingHeat: ceilingHeatFor(r),
    }));
    rankings = attachStatPercentiles(rankings);
  }

  // Widest floor-to-ceiling range this week -- the Outcome Curve column
  // scales each row's middle zone against this, so range width is
  // comparable across rows instead of just two separate digits.
  const maxSpread = rankings.reduce((m, r) => {
    const span = r.floor != null && r.ceiling != null ? r.ceiling - r.floor : 0;
    return Math.max(m, span);
  }, 1);

  const positions = sortPositions([...new Set(rankings.map((r) => r.position))]);

  const { sortKey, sortDir } = resolveSort(params, "rank", "asc");
  const overallRows = sortRows(
    rankings.map((r) => ({ ...r, displayRank: r.rank })),
    sortKey,
    sortDir,
    OVERALL_COLUMN_TYPES
  );
  const canExport = tier === "singularity" && rankings.length > 0;
  const isTeaser = !hasFullAccess && totalCount > 50;

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap redraft-wrap">
        {rankings.length === 0 ? (
          <>
            <div className="eyebrow">
              {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
            </div>
            <h1>Weekly Projection Rankings</h1>
            <p className="tool-sub">
              Standard weekly projection rankings, refreshed every week of the season and
              adjusted for opponent-strength and matchup efficiency data.
              Top 50 free for every Stargazer.
            </p>
            <div className="tool-empty">
              <p>
                Rankings publish weekly during the season — check back soon.
              </p>
            </div>
          </>
        ) : (
          <>
            <RedraftRankingsClient
              rawRows={overallRows}
              sortKey={sortKey}
              sortDir={sortDir}
              currentParams={params}
              positions={positions}
              maxSpread={maxSpread}
              header={
                <>
                  <div className="eyebrow">
                    {latest ? `Week ${latest.week} · ${latest.season}` : "Projections"}
                  </div>
                  <h1>Weekly Projection Rankings</h1>
                  <p className="tool-sub">
                    Standard weekly projection rankings, refreshed every week of the season and
                    adjusted for opponent-strength and matchup efficiency data.
                    Top 50 free for every Stargazer.
                  </p>
                  <div className="toggle-row-flex">
                    <div className="toggle-row-actions">
                      <Link href="/tools/compare-players" className="hub-panel-link">
                        Compare Players →
                      </Link>
                      {canExport && (
                        <ExportCsvButton
                          id="csv-redraft-rankings"
                          filename={`redraft-rankings-week${latest.week}-${latest.season}.csv`}
                          columns={[
                            { key: "rank", label: "Rank" },
                            { key: "player_name", label: "Player" },
                            { key: "position", label: "Position" },
                            { key: "team", label: "Team" },
                            { key: "opponent", label: "Opponent" },
                            { key: "floor", label: "Floor" },
                            { key: "ceiling", label: "Ceiling" },
                            { key: "trend", label: "Trend" },
                            { key: "sample_confidence", label: "Confidence" },
                            { key: "notes", label: "Notes" },
                          ]}
                          rows={overallRows}
                        />
                      )}
                    </div>
                  </div>
                </>
              }
            />

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top 50 of {totalCount} players. Unlock
                  the full list with Explorer or Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import SiteHeader from "../../SiteHeader";
import STAT_LABELS from "../statLabels";
import ComparePlayerPickers from "../ComparePlayerPickers";
import CompareStatsTable from "../CompareStatsTable";

export const metadata = {
  title: "Compare Players — Season Simulations — Singularity Dynasty",
};

const SLOTS = ["p1", "p2", "p3"];
const TEASER_LIMIT = 10;
const GAMES_PER_SEASON = 17;
// Singularity-only, same as Player Season Simulations itself -- this is a
// view over that same dataset, so the tier gate has to match exactly or
// a free/Explorer user could use this tool to see players past the
// teaser boundary.
const PAID_TIERS = ["singularity"];

export default async function ComparePlayerSimsPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sims = [];
  if (latest) {
    let query = supabase
      .from("player_simulations")
      .select("player_name, position, team, floor, median, ceiling, stat_ranges, trend, sample_confidence, notes")
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("median", { ascending: false });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data } = await query;

    // Position-relative rank (RB1, WR23, ...) computed from the same
    // median-descending order the query already fetches in -- Player
    // Season Simulations doesn't have a rank column to key off, unlike
    // Redraft/Best Ball, so this uses the query's own natural order.
    const positionCounters = {};
    sims = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });
  }

  const byName = new Map(sims.map((r) => [r.player_name, r]));
  const selected = SLOTS.map((slot) => byName.get(params?.[slot])).filter(Boolean);

  // Union of stat keys across the selected players, in the shared fixed
  // order -- comparing a QB against a WR means each row only makes sense
  // for some of the players, so a player missing a given stat just shows
  // "—" in that column rather than the row being dropped entirely.
  const statKeysPresent = new Set();
  for (const r of selected) {
    if (r.stat_ranges) Object.keys(r.stat_ranges).forEach((k) => statKeysPresent.add(k));
  }
  const compareStats = STAT_LABELS.filter(([key]) => statKeysPresent.has(key));

  // Same position-relative heat-tint and Range-bar scale as Player Season
  // Simulations' own table, computed across the full fetched pool (not
  // just the 2-3 selected) so a compared player's heat and bar length
  // read against the same population the main table uses.
  const medianRangeByPos = {};
  for (const row of sims) {
    const r = medianRangeByPos[row.position] || { min: Infinity, max: -Infinity };
    r.min = Math.min(r.min, row.median);
    r.max = Math.max(r.max, row.median);
    medianRangeByPos[row.position] = r;
  }
  const maxCeiling = sims.reduce((m, s) => Math.max(m, s.ceiling), 1);
  const selectedWithHeat = selected.map((row) => {
    const r = medianRangeByPos[row.position];
    const heat = r && r.max > r.min ? (row.median - r.min) / (r.max - r.min) : 0;
    return { ...row, heat };
  });
  const playerOptions = sims.map((r) => ({ player_name: r.player_name, position: r.position }));

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.season} Season · Week ${latest.week}` : "Compare"}
        </div>
        <h1>Compare Players — Season Simulations</h1>
        <p className="tool-sub">
          Pick two or three players from Player Season Simulations to see
          them side by side.
        </p>

        {!hasFullAccess && sims.length > 0 && (
          <div className="tool-paywall reveal in">
            <p>
              Free access covers the top {TEASER_LIMIT} players. Unlock
              every player with Singularity.
            </p>
            <Link href="/#pricing" className="btn-primary">
              See Pricing
            </Link>
          </div>
        )}

        {sims.length === 0 ? (
          <div className="tool-empty">
            <p>Simulations publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
            <form className="compare-form">
              <ComparePlayerPickers
                players={playerOptions}
                defaults={{ p1: params?.p1 || "", p2: params?.p2 || "", p3: params?.p3 || "" }}
              />
            </form>

            {selectedWithHeat.length >= 2 ? (
              <CompareStatsTable
                selected={selectedWithHeat}
                compareStats={compareStats}
                maxCeiling={maxCeiling}
                gamesPerSeason={GAMES_PER_SEASON}
              />
            ) : (
              <p className="tool-hint">Pick at least two players, then hit Compare.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

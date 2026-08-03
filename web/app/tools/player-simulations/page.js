import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";

export const metadata = {
  title: "Player Season Simulations — Singularity Dynasty",
};

const TEASER_LIMIT = 10;
// Singularity-only per the pricing copy — Explorer does not include this.
const PAID_TIERS = ["singularity"];
const COLUMN_TYPES = {
  player_name: "string",
  position: "string",
  team: "string",
  floor: "number",
  median: "number",
  ceiling: "number",
};

export default async function PlayerSimulationsPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("player_simulations")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sims = [];
  let totalCount = 0;

  if (latest) {
    let query = supabase
      .from("player_simulations")
      .select("player_name, position, team, floor, median, ceiling, notes", {
        count: "exact",
      })
      .eq("season", latest.season)
      .order("median", { ascending: false });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data, count } = await query;
    sims = data || [];
    totalCount = count || 0;
  }

  const isTeaser = !hasFullAccess && totalCount > sims.length;
  const { sortKey, sortDir } = resolveSort(params, "median", "desc");
  const sortedSims = sortRows(sims, sortKey, sortDir, COLUMN_TYPES);
  const maxCeiling = sims.reduce((m, s) => Math.max(m, s.ceiling), 1);
  const sortProps = { activeSort: sortKey, activeDir: sortDir, currentParams: params };
  const canExport = tier === "singularity" && sims.length > 0;

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">{latest ? `${latest.season} Season` : "Simulations"}</div>
        <h1>Player Season Simulations</h1>
        <p className="tool-sub">
          Full-season Monte Carlo simulations run 10,000 times per player,
          distilled to a 10th / 50th / 90th percentile floor, median, and
          ceiling.
        </p>

        {sims.length === 0 ? (
          <div className="tool-empty">
            <p>Simulations publish each season — check back soon.</p>
          </div>
        ) : (
          <>
            {canExport && (
              <div className="tool-export-row">
                <ExportCsvButton
                  id="csv-player-simulations"
                  filename={`player-simulations-${latest.season}.csv`}
                  columns={[
                    { key: "player_name", label: "Player" },
                    { key: "position", label: "Position" },
                    { key: "team", label: "Team" },
                    { key: "floor", label: "Floor" },
                    { key: "median", label: "Median" },
                    { key: "ceiling", label: "Ceiling" },
                  ]}
                  rows={sortedSims}
                />
              </div>
            )}
            <div className="rankings-table-wrap">
              <table className="rankings-table sim-table">
                <thead>
                  <tr>
                    <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                    <SortableTh label="Pos" sortKey="position" {...sortProps} />
                    <SortableTh label="Team" sortKey="team" {...sortProps} />
                    <SortableTh label="Floor" sortKey="floor" {...sortProps} />
                    <SortableTh label="Median" sortKey="median" {...sortProps} />
                    <SortableTh label="Ceiling" sortKey="ceiling" {...sortProps} />
                    <th>Range</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSims.map((row) => (
                    <tr key={row.player_name}>
                      <td>{row.player_name}</td>
                      <td className="mono">{row.position}</td>
                      <td className="mono">{row.team || "—"}</td>
                      <td className="mono">{row.floor}</td>
                      <td className="mono">
                        <strong>{row.median}</strong>
                      </td>
                      <td className="mono">{row.ceiling}</td>
                      <td>
                        <div className="sim-bar-track">
                          <div
                            className="sim-bar-range"
                            style={{
                              left: `${(row.floor / maxCeiling) * 100}%`,
                              width: `${((row.ceiling - row.floor) / maxCeiling) * 100}%`,
                            }}
                          ></div>
                          <div
                            className="sim-bar-median"
                            style={{ left: `${(row.median / maxCeiling) * 100}%` }}
                          ></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing {sims.length} of {totalCount} simulated
                  players. Unlock the full set with Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

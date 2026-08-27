import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import SiteHeader from "../../SiteHeader";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";

export const metadata = {
  title: "WR/QB Rookie Prospect Rankings & Comparisons — Singularity Dynasty",
  description:
    "Incoming rookie wide receiver and quarterback rankings with side-by-side statistical comparisons against past draft classes, using athletic and production percentiles. Free for every Stargazer.",
};

const TEASER_LIMIT_PER_POSITION = 5;
// Singularity-only per the pricing copy.
const PAID_TIERS = ["singularity"];
const COLUMN_TYPES = { rank: "number", player_name: "string", school: "string" };

async function fetchPosition(supabase, draftClass, position, hasFullAccess) {
  let query = supabase
    .from("prospect_rankings")
    .select("rank, player_name, position, school, comp, notes", {
      count: "exact",
    })
    .eq("draft_class", draftClass)
    .eq("position", position)
    .order("rank", { ascending: true });

  if (!hasFullAccess) {
    query = query.limit(TEASER_LIMIT_PER_POSITION);
  }

  const { data, count } = await query;
  return { rows: data || [], total: count || 0 };
}

export default async function ProspectRankingsPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("prospect_rankings")
    .select("draft_class")
    .order("draft_class", { ascending: false })
    .limit(1)
    .maybeSingle();

  let wrs = { rows: [], total: 0 };
  let qbs = { rows: [], total: 0 };

  if (latest) {
    [wrs, qbs] = await Promise.all([
      fetchPosition(supabase, latest.draft_class, "WR", hasFullAccess),
      fetchPosition(supabase, latest.draft_class, "QB", hasFullAccess),
    ]);
  }

  const totalRows = wrs.rows.length + qbs.rows.length;
  const totalCount = wrs.total + qbs.total;
  const isTeaser = !hasFullAccess && totalCount > totalRows;
  const canExport = tier === "singularity" && totalRows > 0;

  // Each group (WR/QB) sorts independently via a namespaced sort/dir param
  // pair so sorting one table doesn't re-sort the other.
  const wrSort = resolveSort(params, "rank", "asc", "wr_sort", "wr_dir");
  const qbSort = resolveSort(params, "rank", "asc", "qb_sort", "qb_dir");
  const sortedWrs = sortRows(wrs.rows, wrSort.sortKey, wrSort.sortDir, COLUMN_TYPES);
  const sortedQbs = sortRows(qbs.rows, qbSort.sortKey, qbSort.sortDir, COLUMN_TYPES);

  const renderGroup = (label, rows, sortState, sortParam, dirParam) => {
    const sortProps = {
      activeSort: sortState.sortKey,
      activeDir: sortState.sortDir,
      currentParams: params,
      sortParam,
      dirParam,
    };
    const sorted = sortRows(rows, sortState.sortKey, sortState.sortDir, COLUMN_TYPES);
    return (
      rows.length > 0 && (
        <div className="draft-round" key={label}>
          <div className="draft-round-title">{label}</div>
          <div className="rankings-table-wrap">
            <table className="rankings-table">
              <thead>
                <tr>
                  <SortableTh label="Rank" sortKey="rank" {...sortProps} />
                  <SortableTh label="Player" sortKey="player_name" {...sortProps} />
                  <SortableTh label="School" sortKey="school" {...sortProps} />
                  <th>Comp</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={`${row.position}-${row.rank}`}>
                    <td className="mono">{row.rank}</td>
                    <td>{row.player_name}</td>
                    <td className="mono">{row.school || "—"}</td>
                    <td className="tool-notes">{row.comp || row.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    );
  };

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.draft_class} Draft Class` : "Prospects"}
        </div>
        <h1>WR/QB Prospect Rankings &amp; Comparisons</h1>
        <p className="tool-sub">
          Incoming rookie rankings for wide receivers and quarterbacks, with
          statistical comps against past prospects using athletic and
          production percentiles.
        </p>

        {totalRows === 0 ? (
          <div className="tool-empty">
            <p>Prospect boards publish ahead of the draft — check back soon.</p>
          </div>
        ) : (
          <>
            {canExport && (
              <div className="tool-export-row">
                <ExportCsvButton
                  id="csv-prospect-rankings"
                  filename={`prospect-rankings-${latest.draft_class}.csv`}
                  columns={[
                    { key: "rank", label: "Rank" },
                    { key: "player_name", label: "Player" },
                    { key: "position", label: "Position" },
                    { key: "school", label: "School" },
                    { key: "comp", label: "Comp" },
                  ]}
                  rows={[...sortedWrs, ...sortedQbs]}
                />
              </div>
            )}
            {renderGroup("Wide Receivers", wrs.rows, wrSort, "wr_sort", "wr_dir")}
            {renderGroup("Quarterbacks", qbs.rows, qbSort, "qb_sort", "qb_dir")}

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing the top {TEASER_LIMIT_PER_POSITION} at
                  each position ({totalRows} of {totalCount} prospects).
                  Unlock the full boards with Singularity.
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

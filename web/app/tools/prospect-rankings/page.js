import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getUserTier } from "@/lib/tier";
import { resolveSort, sortRows } from "@/lib/sortLink";
import InteractiveScript from "../../InteractiveScript";
import SortableTh from "../SortableTh";
import ExportCsvButton from "../ExportCsvButton";

export const metadata = {
  title: "WR/QB Rookie Prospect Rankings & Comparisons — Singularity Dynasty",
  description:
    "Incoming rookie wide receiver and quarterback rankings with side-by-side statistical comparisons against past draft classes, using athletic and production percentiles. Top 5 per position free for every Stargazer.",
};

const TEASER_LIMIT_PER_POSITION = 5;
// Full board for Explorer and up (rookie boards are dynasty-player territory, which is who Explorer is for); everyone else sees
// the top 5 per position. CSV export stays Singularity-only (canExport below).
const PAID_TIERS = ["explorer", "singularity"];
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

// The board is public-read (RLS) and changes by hand a few times a month, so the reads are cached for a minute per
// access level instead of three round trips to Supabase on every visit (the page used to take ~450ms every time).
const getCachedProspects = unstable_cache(
  async (hasFullAccess) => {
    const supabase = createPublicClient();
    const { data: latest } = await supabase
      .from("prospect_rankings")
      .select("draft_class")
      .order("draft_class", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) return { latest: null, wrs: { rows: [], total: 0 }, qbs: { rows: [], total: 0 } };
    const [wrs, qbs] = await Promise.all([
      fetchPosition(supabase, latest.draft_class, "WR", hasFullAccess),
      fetchPosition(supabase, latest.draft_class, "QB", hasFullAccess),
    ]);
    return { latest, wrs, qbs };
  },
  ["prospect-rankings-board"],
  { revalidate: 60 }
);

export default async function ProspectRankingsPage({ searchParams }) {
  const params = await searchParams;
  const { tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { latest, wrs, qbs } = await getCachedProspects(hasFullAccess);

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
    <>
      <InteractiveScript />

      <main id="main-content" className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.draft_class} Draft Class` : "Prospects"}
        </div>
        <h1>WR/QB Prospect Rankings</h1>

        {totalRows === 0 ? (
          <div className="tool-empty">
            <p>Check back soon.</p>
          </div>
        ) : (
          <>
            {canExport && (
              <div className="tool-export-row">
                <ExportCsvButton
                  filename={`prospect-rankings-${latest.draft_class}.csv`}
                  href="/api/prospect-rankings/csv"
                />
              </div>
            )}
            {renderGroup("Wide Receivers", wrs.rows, wrSort, "wr_sort", "wr_dir")}
            {renderGroup("Quarterbacks", qbs.rows, qbSort, "qb_sort", "qb_dir")}

            {isTeaser && (
              <div className="tool-paywall reveal in" data-wall="prospects">
                <p>
                  You&apos;re seeing the top {TEASER_LIMIT_PER_POSITION} at
                  each position ({totalRows} of {totalCount} prospects).
                  Unlock the full boards with Explorer or Singularity.
                </p>
                <Link href="/#pricing" className="btn-primary">
                  See Pricing
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

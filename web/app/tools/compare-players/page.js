import { getUserTier } from "@/lib/tier";
import SiteHeader from "../../SiteHeader";
import TeamBadge from "../TeamBadge";

export const metadata = {
  title: "Compare Fantasy Football Players — Weekly Rankings — Singularity Dynasty",
  description:
    "Compare two fantasy football players side-by-side across weekly redraft rankings, matchup data, and raw scoring components.",
};

const SLOTS = ["p1", "p2", "p3"];

function formatProjection(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(1);
}

// Free for everyone, same as Redraft Weekly Rankings — this is a view over
// that same dataset, not a separate tier-gated feature.
export default async function ComparePlayersPage({ searchParams }) {
  const params = await searchParams;
  const { supabase } = await getUserTier();

  const { data: latest } = await supabase
    .from("redraft_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];
  if (latest) {
    const { data } = await supabase
      .from("redraft_rankings")
      .select("rank, player_name, position, team, projection, notes")
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    // Position-relative rank (RB1, WR23, ...), same computation as the
    // main Redraft Rankings table -- this page runs its own query, so it
    // needs its own copy rather than inheriting the other page's.
    const positionCounters = {};
    rankings = (data || []).map((r) => {
      positionCounters[r.position] = (positionCounters[r.position] || 0) + 1;
      return { ...r, positionLabel: `${r.position}${positionCounters[r.position]}` };
    });
  }

  const byName = new Map(rankings.map((r) => [r.player_name, r]));
  const selected = SLOTS.map((slot) => byName.get(params?.[slot])).filter(Boolean);

  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `Week ${latest.week} · ${latest.season}` : "Compare"}
        </div>
        <h1>Compare Players</h1>
        <p className="tool-sub">
          Pick two or three players from this week&apos;s redraft rankings to
          see them side by side.
        </p>

        {rankings.length === 0 ? (
          <div className="tool-empty">
            <p>Rankings publish weekly during the season — check back soon.</p>
          </div>
        ) : (
          <>
            <form className="compare-form">
              {SLOTS.map((slot, i) => (
                <div className="compare-form-field" key={slot}>
                  <label htmlFor={slot} className="feed-label mono">
                    Player {i + 1}
                  </label>
                  <select
                    id={slot}
                    name={slot}
                    defaultValue={params?.[slot] || ""}
                    className="compare-select"
                  >
                    <option value="">— None —</option>
                    {rankings.map((r) => (
                      <option value={r.player_name} key={r.player_name}>
                        {r.player_name} ({r.position})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button type="submit" className="btn-primary compare-submit">
                Compare
              </button>
            </form>

            {selected.length >= 2 ? (
              <div className="compare-table-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th></th>
                      {selected.map((r) => (
                        <th key={r.player_name}>{r.player_name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Rank</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.rank}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Position</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.positionLabel || r.position}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Team</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          <TeamBadge team={r.team} />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Proj</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {formatProjection(r.projection)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Notes</th>
                      {selected.map((r) => (
                        <td className="tool-notes" key={r.player_name}>
                          {r.notes || ""}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="tool-hint">Pick at least two players, then hit Compare.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

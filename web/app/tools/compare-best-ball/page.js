import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Compare Players — Best Ball — Singularity Dynasty",
};

const SLOTS = ["p1", "p2", "p3"];
const TEASER_LIMIT = 10;
const PAID_TIERS = ["explorer", "singularity"];

function formatScore(value) {
  return value === null || value === undefined ? "—" : Math.round(Number(value));
}

// "21-25" when a range is published, falling back to the single ceiling
// number if ceiling_range_low hasn't been uploaded for this row yet.
function formatCeilingRange(r) {
  if (r.ceiling_score === null || r.ceiling_score === undefined) return "—";
  const high = Math.round(Number(r.ceiling_score));
  if (r.ceiling_range_low === null || r.ceiling_range_low === undefined) return String(high);
  return `${Math.round(Number(r.ceiling_range_low))}-${high}`;
}

// Same tier gate as Best Ball Rankings itself -- this is a view over that
// same dataset, so a free user must not be able to use it to see or
// compare players past the top-10 teaser boundary.
export default async function CompareBestBallPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("best_ball_rankings")
    .select("season, week")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rankings = [];
  if (latest) {
    let query = supabase
      .from("best_ball_rankings")
      .select(
        "rank, player_name, position, team, opponent, ceiling_score, ceiling_range_low, ceiling_probability, playoff_ceiling_score, notes"
      )
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("rank", { ascending: true });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data } = await query;
    rankings = data || [];
  }

  const byName = new Map(rankings.map((r) => [r.player_name, r]));
  const selected = SLOTS.map((slot) => byName.get(params?.[slot])).filter(Boolean);

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `Week ${latest.week} · ${latest.season}` : "Compare"}
        </div>
        <h1>Compare Players — Best Ball</h1>
        <p className="tool-sub">
          Pick two or three players from this week&apos;s Best Ball
          Rankings to see them side by side.
        </p>

        {!hasFullAccess && rankings.length > 0 && (
          <div className="tool-paywall reveal in">
            <p>
              Free access covers the top {TEASER_LIMIT} players. Unlock
              every player with Explorer or Singularity.
            </p>
            <Link href="/#pricing" className="btn-primary">
              See Pricing
            </Link>
          </div>
        )}

        {rankings.length === 0 ? (
          <div className="tool-empty">
            <p>Rankings publish through the season — check back soon.</p>
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
                          {r.position}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Team</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.team || "—"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Opp</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.opponent || "—"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>This Week</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {formatCeilingRange(r)}
                          {r.ceiling_probability !== null &&
                            r.ceiling_probability !== undefined &&
                            ` (${r.ceiling_probability}%)`}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Playoffs (Wk 15-17)</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {formatScore(r.playoff_ceiling_score)}
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
      <InteractiveScript />
    </div>
  );
}

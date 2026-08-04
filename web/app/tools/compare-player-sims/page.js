import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Compare Players — Season Simulations — Singularity Dynasty",
};

const SLOTS = ["p1", "p2", "p3"];
const TEASER_LIMIT = 10;
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
      .select("player_name, position, team, floor, median, ceiling, notes")
      .eq("season", latest.season)
      .eq("week", latest.week)
      .order("median", { ascending: false });

    if (!hasFullAccess) {
      query = query.limit(TEASER_LIMIT);
    }

    const { data } = await query;
    sims = data || [];
  }

  const byName = new Map(sims.map((r) => [r.player_name, r]));
  const selected = SLOTS.map((slot) => byName.get(params?.[slot])).filter(Boolean);

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

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
                    {sims.map((r) => (
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
                      <th>Floor</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.floor}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Median</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          <strong>{r.median}</strong>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th>Ceiling</th>
                      {selected.map((r) => (
                        <td className="mono" key={r.player_name}>
                          {r.ceiling}
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

import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "WR/QB Prospect Rankings — Singularity Dynasty",
};

// Included free in Stargazer per the pricing copy — no tier gating here,
// unlike the other /tools/* pages.
export default async function ProspectRankingsPage() {
  const { supabase } = await getUserTier();

  const { data: latest } = await supabase
    .from("prospect_rankings")
    .select("draft_class")
    .order("draft_class", { ascending: false })
    .limit(1)
    .maybeSingle();

  let prospects = [];
  if (latest) {
    const { data } = await supabase
      .from("prospect_rankings")
      .select("rank, player_name, position, school, comp, notes")
      .eq("draft_class", latest.draft_class)
      .order("position", { ascending: true })
      .order("rank", { ascending: true });
    prospects = data || [];
  }

  const wrs = prospects.filter((p) => p.position === "WR");
  const qbs = prospects.filter((p) => p.position === "QB");

  const renderGroup = (label, rows) =>
    rows.length > 0 && (
      <div className="draft-round" key={label}>
        <div className="draft-round-title">{label}</div>
        <div className="rankings-table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>School</th>
                <th>Comp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
    );

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">
          {latest ? `${latest.draft_class} Draft Class` : "Prospects"}
        </div>
        <h1>WR/QB Prospect Rankings &amp; Comparisons</h1>
        <p className="tool-sub">
          Incoming rookie rankings for wide receivers and quarterbacks, with
          statistical comps against past prospects using athletic and
          production percentiles. Free for every Stargazer.
        </p>

        {prospects.length === 0 ? (
          <div className="tool-empty">
            <p>Prospect boards publish ahead of the draft — check back soon.</p>
          </div>
        ) : (
          <>
            {renderGroup("Wide Receivers", wrs)}
            {renderGroup("Quarterbacks", qbs)}
          </>
        )}
      </main>
      <InteractiveScript />
    </div>
  );
}

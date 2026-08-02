import Link from "next/link";
import { getUserTier } from "@/lib/tier";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Dynasty Draft Board — Singularity Dynasty",
};

const PAID_TIERS = ["explorer", "singularity"];

export default async function DraftBoardPage({ searchParams }) {
  const params = await searchParams;
  const boardType = params?.type === "rookie" ? "rookie" : "startup";

  const { supabase, tier } = await getUserTier();
  const hasFullAccess = PAID_TIERS.includes(tier);

  const { data: latest } = await supabase
    .from("draft_board")
    .select("season")
    .eq("board_type", boardType)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  let picks = [];
  let totalRounds = 0;

  if (latest) {
    const { data: roundStats } = await supabase
      .from("draft_board")
      .select("round")
      .eq("board_type", boardType)
      .eq("season", latest.season)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle();
    totalRounds = roundStats?.round || 0;

    let query = supabase
      .from("draft_board")
      .select("round, pick, player_name, position, team, is_stack, stack_note")
      .eq("board_type", boardType)
      .eq("season", latest.season)
      .order("round", { ascending: true })
      .order("pick", { ascending: true });

    if (!hasFullAccess) {
      query = query.lte("round", 1);
    }

    const { data } = await query;
    picks = data || [];
  }

  const rounds = {};
  picks.forEach((p) => {
    (rounds[p.round] ??= []).push(p);
  });
  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const isTeaser = !hasFullAccess && totalRounds > 1;

  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">{latest ? `${latest.season} Board` : "Draft Board"}</div>
        <h1>Dynasty Draft Board</h1>
        <p className="tool-sub">
          A full startup and rookie draft board, laid out round by round,
          with correlated stacks auto-flagged via roster-construction
          analysis.
        </p>

        <div className="board-toggle">
          <Link
            href="?type=startup"
            className={boardType === "startup" ? "active" : ""}
          >
            Startup
          </Link>
          <Link
            href="?type=rookie"
            className={boardType === "rookie" ? "active" : ""}
          >
            Rookie
          </Link>
        </div>

        {picks.length === 0 ? (
          <div className="tool-empty">
            <p>This board hasn&apos;t been published yet — check back soon.</p>
          </div>
        ) : (
          <>
            {roundNumbers.map((roundNum) => (
              <div className="draft-round" key={roundNum}>
                <div className="draft-round-title">Round {roundNum}</div>
                <div className="rankings-table-wrap">
                  <table className="rankings-table">
                    <thead>
                      <tr>
                        <th>Pick</th>
                        <th>Player</th>
                        <th>Pos</th>
                        <th>Team</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rounds[roundNum].map((p) => (
                        <tr key={p.pick}>
                          <td className="mono">
                            {roundNum}.{String(p.pick).padStart(2, "0")}
                          </td>
                          <td>{p.player_name}</td>
                          <td className="mono">{p.position}</td>
                          <td className="mono">{p.team || "—"}</td>
                          <td>
                            {p.is_stack && (
                              <span
                                className="stack-badge"
                                title={p.stack_note || "Correlated stack"}
                              >
                                STACK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {isTeaser && (
              <div className="tool-paywall reveal in">
                <p>
                  You&apos;re seeing Round 1 of {totalRounds} rounds. Unlock
                  the full board with Explorer or Singularity.
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

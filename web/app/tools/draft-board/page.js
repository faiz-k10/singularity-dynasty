import Link from "next/link";
import SkyCredit from "../../SkyCredit";
import { getUserTier } from "@/lib/tier";
import InteractiveScript from "../../InteractiveScript";
import DynastyBoard from "./DynastyBoard";
import { DYNASTY_THROUGH, FREE_ROWS, getDynastyRows } from "@/lib/dynastyData";

export const metadata = {
  title: "Dynasty Board — Dynasty Singularity",
  description:
    "Dynasty rankings built from production over replacement and age, split into tiers of players the numbers can't separate. Superflex or 1QB, contender or rebuilder. Full board with Explorer or Singularity.",
};

const PAID_TIERS = ["explorer", "singularity"];
async function RankingsView({ hasFullAccess, signedIn }) {
  const { rows, total, meta } = getDynastyRows(hasFullAccess);
  return (
    <>
      <InteractiveScript />
      {signedIn && <SkyCredit action="dynasty" />}
      <main id="main-content" className="wrap tool-wrap dynasty-wrap">
        <div className="tool-header-split">
          <div className="tool-header-left">
            <div className="eyebrow">{DYNASTY_THROUGH ? `Dynasty · Through week ${DYNASTY_THROUGH.week} · ${DYNASTY_THROUGH.season}` : "Dynasty"}</div>
            <h1>Dynasty Board</h1>
          </div>
        </div>
        <DynastyBoard rows={rows} meta={meta} />
        {!hasFullAccess && (
          <div className="tool-paywall reveal in" data-wall="dynasty-board">
            <p>
              You&apos;re seeing the top {FREE_ROWS} of {total} ranked players. Unlock the full board with Explorer or Singularity.
            </p>
            <Link href="/#pricing" className="btn-primary">
              See Pricing
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export default async function DraftBoardPage() {
  const { tier, user } = await getUserTier();
  return <RankingsView hasFullAccess={PAID_TIERS.includes(tier)} signedIn={!!user} />;
}

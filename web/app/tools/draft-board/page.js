import Link from "next/link";
import { awardLater } from "@/lib/nightSkyStore";
import { getUserTier } from "@/lib/tier";
import InteractiveScript from "../../InteractiveScript";
import DynastyBoard from "./DynastyBoard";
import { FREE_ROWS, getDynastyRows } from "@/lib/dynastyData";

export const metadata = {
  title: "Dynasty Board — Dynasty Singularity",
  description:
    "Dynasty rankings built from production over replacement and age, split into tiers by how often one player really beats the next. Superflex or 1QB, contender or rebuilder. Full board with Explorer or Singularity.",
};

const PAID_TIERS = ["explorer", "singularity"];
async function RankingsView({ hasFullAccess }) {
  const { rows, total, meta } = getDynastyRows(hasFullAccess);
  return (
    <>
      <InteractiveScript />
      <main id="main-content" className="wrap tool-wrap">
        <div className="tool-header-split">
          <div className="tool-header-left">
            <div className="eyebrow">{"Dynasty"}</div>
            <h1>Dynasty Board</h1>
          </div>
        </div>
        <DynastyBoard rows={rows} meta={meta} complete={rows.length === total} />
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
  awardLater(user?.id, "dynasty"); // a Night Sky star
  return <RankingsView hasFullAccess={PAID_TIERS.includes(tier)} />;
}

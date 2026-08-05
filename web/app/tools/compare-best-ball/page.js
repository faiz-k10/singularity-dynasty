import Link from "next/link";
import ThemeToggle from "../../ThemeToggle";
import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Compare Players — Best Ball — Singularity Dynasty",
};

// This view is over the same dataset as Best Ball Rankings, so it's paused
// alongside it — see app/tools/best-ball-rankings/page.js for the sunset
// note.
export default function CompareBestBallPage() {
  return (
    <div className="tool-page">
      <ThemeToggle />
      <Link href="/" className="brandmark brandmark-nav">
        <span className="ring"></span>Singularity Dynasty
      </Link>

      <main className="wrap tool-wrap">
        <div className="eyebrow">Compare</div>
        <h1>Compare Players — Best Ball</h1>
        <div className="tool-empty">
          <p>This tool is paused for now — check back soon.</p>
        </div>
      </main>
      <InteractiveScript />
    </div>
  );
}

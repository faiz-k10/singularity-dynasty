import InteractiveScript from "../../InteractiveScript";

export const metadata = {
  title: "Best Ball Rankings — Singularity Dynasty",
};

// Sunset "for now" — pulled off the landing page and out of the sitemap,
// and this page no longer queries Supabase, so it costs nothing to serve
// while paused. Swap this back for the live version to bring it back.
export default function BestBallRankingsPage() {
  return (
    <div className="tool-page">
      <InteractiveScript />

      <main className="wrap tool-wrap">
        <div className="eyebrow">Best Ball</div>
        <h1>Best Ball Rankings</h1>
        <div className="tool-empty">
          <p>This tool is paused for now — check back soon.</p>
        </div>
      </main>
    </div>
  );
}

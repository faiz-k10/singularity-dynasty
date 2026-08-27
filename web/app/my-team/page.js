import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "My Team — Singularity Dynasty",
  description:
    "Build your team, connect your league, and get personalized roster analysis. Coming soon.",
};

// Placeholder for the team & profile builder (import a roster from
// Sleeper/Yahoo/ESPN, save it, and power Team Analysis from it) — not
// built yet. Replace this with the real page once that's ready; no
// Supabase queries here in the meantime, so it costs nothing to serve.
export default function MyTeamPage() {
  return (
    <div className="tool-page">
      <SiteHeader />

      <main className="wrap tool-wrap">
        <div className="eyebrow">My Team</div>
        <h1>My Team</h1>
        <p className="tool-sub">
          Build your team and profile, connect your Sleeper, Yahoo, or ESPN
          league, and get personalized roster analysis powered by the same
          models behind every other tool.
        </p>
        <div className="tool-empty">
          <p>This is coming soon — check back later.</p>
        </div>
      </main>
    </div>
  );
}

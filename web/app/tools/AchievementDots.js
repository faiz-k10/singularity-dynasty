// Shared glance-able "this player has flags" dot preview -- pulled out
// of RankingsTable.js so Player Season Simulations/Prospect Rankings/
// Compare Players/My Team can show the exact same achievement dots
// Weekly Projection Rankings does, off the same getAchievements() list,
// instead of each page growing its own copy. Colored per achievements.js's
// own `variant`, so a row with a gold star and a green lock waiting
// inside reads as gold+green dots here too, without spelling either one
// out. Native `title` carries the plain-English list for anyone who
// hovers.
export default function AchievementDots({ achievements, vertical }) {
  if (!achievements || !achievements.length) return null;
  return (
    <span
      className={`player-achv-dots${vertical ? " vertical" : ""}`}
      title={achievements.map((a) => a.label).join(" · ")}
    >
      {achievements.map((a) => (
        <span key={a.key} className={`player-achv-dot ${a.variant}`} />
      ))}
    </span>
  );
}

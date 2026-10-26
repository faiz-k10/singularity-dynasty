"use client";

// One league's standings + playoff odds (settings.season from lib/leagueSeason.js), shown at the bottom of the
// matchup panel: rank, record, points for / against, projected wins and the chance to make the playoffs / finish
// first. Your row is gold, this week's opponent blue; a line marks the current playoff cut.

// A simulated 0 or 100 is shown as "<1%" / ">99%": thousands of simulated seasons without a miss is not a guarantee.
// Exact 0% / 100% only when `settled` (season over, or mathematically out -- lib/leagueSeason.js).
const pct = (p, settled = false) => {
  if (p == null) return "—";
  if (settled && (p === 0 || p === 1)) return `${p * 100}%`;
  return p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
};

export function oddsTone(p) {
  if (p == null) return "";
  return p >= 0.75 ? "odds-high" : p >= 0.35 ? "odds-mid" : "odds-low";
}

export { pct as formatOdds };

export default function Standings({ season, opponent, bare = false }) {
  if (!season?.standings?.length) return null;
  const { standings, playoffTeams, weeksLeft, byPoints, medianGame } = season;
  const notes = [
    playoffTeams ? `Top ${playoffTeams} make the playoffs` : null,
    weeksLeft ? `${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} left` : "Regular season over",
    byPoints ? "ranked by points (best ball)" : "ranked by wins, then points",
    medianGame ? "weekly median game" : null,
  ].filter(Boolean);
  return (
    <section className="standings" aria-label="Standings and playoff odds">
      <div className="standings-head">
        {!bare && <h3 className="board-panel-title">Standings &amp; playoff odds</h3>}
        <span className="standings-note mono">{notes.join(" · ")}</span>
      </div>
      <div className="standings-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="align-left">Team</th>
              <th>Record</th>
              <th>PF</th>
              <th>PA</th>
              <th>Proj W</th>
              <th>Playoffs</th>
              <th>#1 seed</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((t) => (
              <tr
                key={t.id}
                className={`${t.isMe ? "is-me" : ""}${!t.isMe && opponent && t.name === opponent ? " is-opp" : ""}${playoffTeams && t.rank === playoffTeams ? " is-cut" : ""}`}
              >
                <td className="mono">{t.rank}</td>
                <td className="align-left standings-team">{t.name}</td>
                <td className="mono">{t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`}</td>
                <td className="mono">{t.pf.toFixed(1)}</td>
                <td className="mono">{t.pa.toFixed(1)}</td>
                <td className="mono">{t.avgWins ?? "—"}</td>
                <td className={`mono standings-odds ${oddsTone(t.playoffOdds)}`}>{pct(t.playoffOdds, t.settled)}</td>
                <td className="mono standings-first">{pct(t.firstOdds, t.settled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="h2h-note">
        Playoff odds: the rest of the regular season played out 3,000 times. A team&apos;s strength is its scoring so far,
        pulled toward the league average by how much a few weeks can really tell (checked against 327 finished Sleeper
        seasons); this week starts from the points already on the board. Divisions aren&apos;t modelled. Updated once a
        day.
      </p>
    </section>
  );
}

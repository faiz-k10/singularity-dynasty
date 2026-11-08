import TeamBadge from "./TeamBadge";
import CompareTabs from "./CompareTabs";
import Define from "../Define";
import ShareCardButton from "../ShareCardButton";
import { PlayerHeaderPanel, PlayerStatsRow, OutcomeCurvePanel, UsageTdPanel, GameLogPanel } from "./WeeklyDetailRow";
import { fmt1 } from "@/lib/format";

// Compare Players (Weekly Projection Rankings), as two tabs: HEAD TO HEAD (a table of the numbers that matter) and PLAYER PROFILES (the same
// dashboard panels the opened-player row shows (identity + badges, this week / last week, outcome curve, usage or
// touchdown profile, recent games), laid out in one grid row per panel so the players line up side by side.

const f2 = (v) => v.toFixed(2);
const pct1 = (v) => `${v.toFixed(1)}%`;
const int = (v) => String(Math.round(v));
const signed2 = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

// best: "high" | "low" -- which end wins. Rows with fewer than two values, or all equal, highlight nobody.
const ROWS = [
  { label: "Overall Rank", get: (r) => r.rank, fmt: int, best: "low" },
  { label: "Median Proj", term: "projection-median", get: (r) => r.projection, fmt: fmt1, best: "high", strong: true },
  { label: "Floor", term: "floor", get: (r) => r.floor, fmt: fmt1, best: "high" },
  { label: "Ceiling", term: "ceiling", get: (r) => r.ceiling, fmt: fmt1, best: "high" },
  { label: "Last Week Points", get: (r) => r.lastWeekRank?.points, fmt: fmt1, best: "high", missing: (r) => r.lastWeekStatus },
  { group: "Projected stat line (per game)" },
  { label: "Pass Yards", get: (r) => r.passing_yards, fmt: fmt1, best: "high", skipZero: true },
  { label: "Pass TD", get: (r) => r.passing_tds, fmt: f2, best: "high", skipZero: true },
  { label: "INT", get: (r) => r.passing_interceptions, fmt: f2, best: "low", skipZero: true },
  { label: "Rush Yards", get: (r) => r.rushing_yards, fmt: fmt1, best: "high", skipZero: true },
  { label: "Rush TD", get: (r) => r.rushing_tds, fmt: f2, best: "high", skipZero: true },
  { label: "Receptions", get: (r) => r.receptions, fmt: fmt1, best: "high", skipZero: true },
  { label: "Rec Yards", get: (r) => r.receiving_yards, fmt: fmt1, best: "high", skipZero: true },
  { label: "Rec TD", get: (r) => r.receiving_tds, fmt: f2, best: "high", skipZero: true },
  { group: "Key usage profile" },
  { label: "xFP / Game", term: "avgXfp", get: (r) => r.avgXfp, fmt: fmt1, best: "high" },
  { label: "WOPR", term: "wopr", get: (r) => r.wopr, fmt: f2, best: "high" },
  { label: "Target Share", term: "u_tgt_share", get: (r) => r.targetShare, fmt: pct1, best: "high" },
  { label: "YAC Above Exp", term: "yac-above-exp", get: (r) => r.yacAboveExp, fmt: f2, best: "high" },
  { label: "RYOE / Att", term: "ryoe", get: (r) => r.ryoe, fmt: signed2, best: "high" },
  { label: "Scramble Rate", term: "scrambleRate", get: (r) => r.scrambleRate, fmt: pct1, best: "high" },
  { label: "Play-Action Rate", term: "playActionRate", get: (r) => r.playActionRate, fmt: pct1, best: "high" },
  { label: "2+ TD Chance", term: "p2Td", get: (r) => r.p2Td, fmt: pct1, best: "high" },
  { label: "In-10 Tgts / G", term: "i10Pg", get: (r) => r.i10Pg, fmt: f2, best: "high" },
  { label: "In-10 Share", term: "i10Share", get: (r) => r.i10Share, fmt: pct1, best: "high" },
];

function bestIndexes(values, best) {
  const have = values.filter((v) => v != null);
  if (have.length < 2) return new Set();
  const target = best === "low" ? Math.min(...have) : Math.max(...have);
  if (have.every((v) => v === target)) return new Set();
  return new Set(values.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0));
}

function MatchupCell({ row }) {
  if (!row.opponent || row.opponent === "NA") return <span className="mono">BYE</span>;
  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
  return (
    <span className="compare-matchup">
      <span className="matchup-sep">{sep}</span>
      <TeamBadge team={row.opponent} />
    </span>
  );
}

// HEAD TO HEAD as cards (founder, Nov 8 2026: the table left too much empty space): one card per player carrying every number the table
// does -- position, matchup, overall rank, median / floor / ceiling, last week, the projected stat line and the usage profile -- and
// the player's header (photo, size, badges) on top. In each row the best value is shaded mint and the worst red (founder, Nov 8 2026); the card that leads the most rows
// gets a mint top edge. (A Table tab with the old grid was removed on Nov 8 2026, founder.)
function HeadToHeadCards({ players, shown }) {
  const n = players.length;
  // The headline numbers (everything above the first section) become their own "This week" section, listed like every other section.
  const TOP_ORDER = ["Overall Rank", "Median Proj", "Floor", "Ceiling", "Last Week Points"];
  const top = shown
    .filter((r, i) => !r.group && !shown.slice(0, i).some((x) => x.group))
    .sort((a, b) => TOP_ORDER.indexOf(a.def.label) - TOP_ORDER.indexOf(b.def.label));
  const sections = [{ group: "This week", rows: top }];
  for (const r of shown) {
    if (r.group) sections.push({ group: r.group, rows: [] });
    else if (sections.length > 1) sections[sections.length - 1].rows.push(r);
  }
  const leads = players.map((_, i) => shown.filter((r) => !r.group && r.best.has(i)).length);
  const most = Math.max(...leads);
  const val = (r, i) => (r.values[i] == null ? r.def.missing?.(players[i]) || "—" : r.def.fmt(r.values[i]));
  return (
    <>
      <div className="cmpc-grid" style={{ "--cmp-n": n, "--rows": sections.length + 1 }}>
        {players.map((p, i) => (
          <div key={p.player_name} className={`cmpc-card${leads[i] === most ? " is-lead" : ""}`}>
            <div className="cmpc-head">
              <div className="compare-panels cmpc-id">
                <PlayerHeaderPanel row={p} logoByName />
              </div>
            </div>
            {sections.map((sec) => (
              <details key={sec.group} className="cmpc-sec" open>
                <summary>{sec.group}</summary>
                <div className="cmpc-rows">
                  {sec.group === "This week" && (
                    <div className="cmpc-row">
                      <span className="cmpc-row-l">Matchup</span>
                      <span className="cmpc-row-v mono cmpc-matchup">
                        {p.positionLabel || p.position}
                        <MatchupCell row={p} />
                      </span>
                    </div>
                  )}
                  {sec.rows.map((r) => (
                    <div key={r.def.label} className={`cmpc-row${r.best.has(i) ? " is-best" : r.worst.has(i) ? " is-worst" : ""}`}>
                      <span className="cmpc-row-l">{r.def.term ? <Define term={r.def.term}>{r.def.label}</Define> : r.def.label}</span>
                      <span className="cmpc-row-v mono">{val(r, i)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ))}
      </div>
      <p className="compare-legend">In each row the best value is shaded mint and the worst red. Projected stats are per-game averages.</p>
    </>
  );
}

export default function CompareWeekly({ players, maxSpread }) {
  const n = players.length;
  const rows = ROWS.map((def) => {
    if (def.group) return { group: def.group };
    const values = players.map((p) => {
      const v = def.get(p);
      return v == null || Number.isNaN(Number(v)) ? null : Number(v);
    });
    const hasAny = def.skipZero ? values.some((v) => v) : values.some((v) => v != null);
    return hasAny ? { def, values, best: bestIndexes(values, def.best), worst: bestIndexes(values, def.best === "low" ? "high" : "low") } : null;
  }).filter(Boolean);
  // Drop a group heading that ended up with no rows under it.
  const shown = rows.filter((r, i) => !r.group || (rows[i + 1] && !rows[i + 1].group));

  // With exactly two players, the comparison is a start / sit question: its share card makes the pick (lib/startSit.js).
  const [a, b] = players;
  const startSit =
    players.length === 2 ? (
      <ShareCardButton
        card={{ kind: "s", a: [a.player_name, a.position], b: [b.player_name, b.position] }}
        caption={`Start / sit: ${a.player_name} (${a.projection?.toFixed(1)}) or ${b.player_name} (${b.projection?.toFixed(1)})?`}
        file={`singularity-start-sit-${`${a.player_name}-${b.player_name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        label="Share start / sit"
        className="lab-copy compare-share"
      />
    ) : null;

  return (
    <CompareTabs
      extra={startSit}
      tabs={[
        { key: "h2h", label: "Head to Head", node: <HeadToHeadCards players={players} shown={shown} /> },
        {
          key: "profiles",
          label: "Player Profiles",
          node: (
            <div className="compare-panels" style={{ "--cmp-n": n }}>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <PlayerHeaderPanel key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <PlayerStatsRow key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <OutcomeCurvePanel key={p.player_name} row={p} maxSpread={maxSpread} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <UsageTdPanel key={p.player_name} row={p} />
                ))}
              </div>
              <div className="compare-panel-row">
                {players.map((p) => (
                  <GameLogPanel key={p.player_name} games={p.recentGames} />
                ))}
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}

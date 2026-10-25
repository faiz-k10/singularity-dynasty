"use client";

import { useMemo } from "react";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { fmt1 } from "@/lib/format";
import { lineupAlertCount, rangeText, slotLabel } from "@/lib/lineupOptimizer";


function Who({ p }) {
  return (
    <span className="lu-who">
      <PositionBadge position={p.position} />
      {p.team && <TeamBadge team={p.team} />}
      <span className="lu-name">{p.name}</span>
    </span>
  );
}

// A player's median and floor-ceiling range, as the rankings publish them, plus a Smash / Tough Spot tag when his matchup is flagged.
function Range({ p }) {
  const lean = p.myLean ? (p.myLean.call === "SMASH" ? "Smash" : "Tough") : null;
  return (
    <>
      <span className="lu-pts mono" title="Median (floor–ceiling), as in the weekly rankings. The decision uses the median and the matchup trend; the range is for context.">{rangeText(p)}</span>
      {lean && (
        <span className={`lu-lean mono ${lean === "Smash" ? "is-smash" : "is-tough"}`} title={`${lean} spot: ${p.myLean.effect > 0 ? "+" : "−"}${fmt1(Math.abs(p.myLean.effect))} pts/game vs. an average defense; his range is moved by that`}>
          {lean}
        </span>
      )}
    </>
  );
}

// "Start X over Y" rows, one per swap, each legal for the slot named at the left and each a gain (lib/lineupOptimizer.js never recommends a loss).
// The gain is points of median + matchup trend; the floor-ceiling range is context only (it is not part of the decision).
function SwapList({ swaps }) {
  return (
    <ul className="lu-swaps">
      {swaps.map((x) => (
        <li key={`${x.slot}:${x.in.player_id}`} className="lu-swap">
          <span className="lu-slot mono">{slotLabel(x.slot)}</span>
          <span className="lu-verb mono">Start</span>
          <Who p={x.in} />
          <Range p={x.in} />
          {x.out && (
            <>
              <span className="lu-verb mono">over</span>
              <Who p={x.out} />
              <Range p={x.out} />
            </>
          )}
          <span className="lu-gain mono" title="Median points gained, counting each player's Smash / Tough Spot">+{fmt1(x.gain)}</span>
          {x.why && <span className="lu-why">{x.why}</span>}
        </li>
      ))}
    </ul>
  );
}

// The "Lineup alerts" tab of a league: the best starters from the roster by this week's projection, who to start over whom and what it
// adds, plus (when the win chance is lopsided) a version that plays for the ceiling or the floor. lib/lineupOptimizer.js does the
// work; players whose game has started are locked and left where they are.
export default function LineupAdvice({ team, gameStates, injuries = [] }) {
  const count = useMemo(() => lineupAlertCount(team, gameStates, injuries), [team, gameStates, injuries]);
  const { alerts, advice } = count;
  const url = team.platform_league_id ? `https://sleeper.com/leagues/${team.platform_league_id}/matchup` : null;
  if (!advice) return <p className="h2h-note">No lineup to optimize for this league this week.</p>;
  const better = advice.swaps.length > 0 && advice.gain >= 0.1;
  return (
    <section className="standings lineup-advice" aria-label="Lineup optimizer">
      <div className="lu-alerts">
        <div className="lu-alerts-head">
          <h4 className="lu-alerts-title mono">
            Lineup Alerts{count.total > 0 && <span className="lu-alerts-count">{count.total}</span>}
          </h4>
          {url && (
            <a className="h2h-sleeper lu-sleeper mono" href={url} target="_blank" rel="noopener noreferrer" title="Best lineup by this week's projection; locked players stay put">
              <img src="/sleeper-logo.png" alt="" width="22" height="22" className="lu-sleeper-logo" />
              Set it in Sleeper <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        {alerts.length === 0 ? (
          <p className="lu-alerts-none mono">No injury or bye alerts: every starter is healthy and in a game this week.</p>
        ) : (
          <ul className="lu-alert-list">
            {alerts.map((a) => (
              <li key={`${a.type}:${a.slot}:${a.player?.player_id || "none"}`} className="lu-alert">
                <span className={`status-dot status-dot-${a.severity}`} aria-hidden="true" />
                <span className="lu-alert-who">
                  {a.player ? <Who p={a.player} /> : <span className="lu-name">Nobody starting</span>}
                  <span className={`status-text status-text-${a.severity}`}>{a.status}</span>
                  <span className="lu-verb mono">in {slotLabel(a.slot)}</span>
                </span>
                <span className="lu-alert-fix mono">
                  {a.replacement ? (
                    <>
                      Swap in <strong>{a.replacement.name}</strong> ({fmt1(a.replacement.myProjPts)})
                    </>
                  ) : (
                    "No bench option"
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lu-summary">
        <div className="lu-total">
          <span className="lu-big">{better ? `+${fmt1(advice.gain)}` : "Set"}</span>
          <span className="lu-cap mono">{better ? "projected points available" : "your lineup is already the best we project"}</span>
        </div>
        {advice.lockedStarters > 0 && <div className="lu-line mono"><span className="lu-locked">{advice.lockedStarters} locked</span></div>}
      </div>
      {better && <SwapList swaps={advice.swaps} />}
      <p className="standings-note mono">
        Start / sit goes by each player&apos;s median plus his Smash / Tough Spot, the two inputs that held up in a backtest; floor and ceiling are shown for context.
        K, DEF and IDP slots aren&apos;t optimized.
      </p>
    </section>
  );
}

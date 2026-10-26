"use client";

import { useMemo } from "react";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { fmt1 } from "@/lib/format";
import { lineupAlertCount, slotLabel } from "@/lib/lineupOptimizer";

function Who({ p }) {
  return (
    <span className="lu-who">
      <PositionBadge position={p.position} />
      {p.team && <TeamBadge team={p.team} />}
      <span className="lu-name">{p.name}</span>
    </span>
  );
}

// A Smash / Tough Spot tag when his matchup is flagged (it moves his number in the decision).
function LeanTag({ p }) {
  if (!p.myLean) return null;
  const lean = p.myLean.call === "SMASH" ? "Smash" : "Tough";
  return (
    <span className={`lu-lean mono ${lean === "Smash" ? "is-smash" : "is-tough"}`}>
      {lean}
    </span>
  );
}

// "Start X over Y" rows, one per swap, each legal for the slot named at the left and each a gain (lib/lineupOptimizer.js never recommends a loss).
// The gain is projected points: the median plus the matchup trend (the range is only in the hover tip, it is not part of the decision).
function SwapList({ swaps }) {
  return (
    <ul className="lu-swaps">
      {swaps.map((x) => (
        <li key={`${x.slot}:${x.in.player_id}`} className="lu-swap">
          <span className="lu-slot mono">{slotLabel(x.slot)}</span>
          <span className="lu-verb mono">Start</span>
          <Who p={x.in} />
          <LeanTag p={x.in} />
          {x.out && (
            <>
              <span className="lu-verb mono">over</span>
              <Who p={x.out} />
              <LeanTag p={x.out} />
            </>
          )}
          <span className="lu-gain mono"><span className="lu-gain-label">proj.</span> +{fmt1(x.gain)}</span>
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
            <a className="h2h-sleeper lu-sleeper mono" href={url} target="_blank" rel="noopener noreferrer">
              <img src="/sleeper-logo.png" alt="" width="22" height="22" className="lu-sleeper-logo" />
              Set Lineup in Sleeper <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        {alerts.length > 0 && (
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
    </section>
  );
}

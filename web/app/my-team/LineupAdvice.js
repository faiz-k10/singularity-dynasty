"use client";

import { useMemo } from "react";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { fmt1 } from "@/lib/format";
import { lineupAlertCount, matchupNudge, slotLabel } from "@/lib/lineupOptimizer";


function Who({ p }) {
  return (
    <span className="lu-who">
      <PositionBadge position={p.position} />
      {p.team && <TeamBadge team={p.team} />}
      <span className="lu-name">{p.name}</span>
    </span>
  );
}

// What a swap row's number is made of, for the hover tip: his weekly range and any Smash / Tough Spot nudge.
const rangeTip = (p) => {
  const range = p.myFloor != null && p.myCeiling != null ? `${fmt1(p.myFloor)} floor · ${fmt1(p.myProjPts)} median · ${fmt1(p.myCeiling)} ceiling` : `${fmt1(p.myProjPts)} median`;
  const lean = p.myLean ? ` · ${p.myLean.call === "SMASH" ? "Smash" : "Tough"} spot (${p.myLean.effect > 0 ? "+" : "−"}${fmt1(Math.abs(matchupNudge(p)))} nudge)` : "";
  return `${range}${lean}`;
};

// A player's start score plus a Smash / Tough Spot tag when the matchup nudged it (the score is lib/lineupOptimizer.js startValue; the
// tip shows what it was made of).
function Score({ p }) {
  return (
    <>
      <span className="lu-pts mono" title={rangeTip(p)}>{fmt1(p.val)}</span>
      {p.myLean && <span className={`lu-lean mono ${p.myLean.call === "SMASH" ? "is-smash" : "is-tough"}`}>{p.myLean.call === "SMASH" ? "Smash" : "Tough"}</span>}
    </>
  );
}

// "Start X over Y" rows, one per swap, each legal for the slot named at the left and each a gain (lib/lineupOptimizer.js never recommends a loss).
function SwapList({ swaps }) {
  return (
    <ul className="lu-swaps">
      {swaps.map((x) => (
        <li key={`${x.slot}:${x.in.player_id}`} className="lu-swap">
          <span className="lu-slot mono">{slotLabel(x.slot)}</span>
          <span className="lu-verb mono">Start</span>
          <Who p={x.in} />
          <Score p={x.in} />
          {x.out && (
            <>
              <span className="lu-verb mono">over</span>
              <Who p={x.out} />
              <Score p={x.out} />
            </>
          )}
          <span className="lu-gain mono">+{fmt1(x.gain)}</span>
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
  const t = advice.tilt;
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
          <span className="lu-cap mono">{better ? "expected points available" : "your lineup is already the best we project"}</span>
        </div>
        <div className="lu-line mono">
          Now {fmt1(advice.current)} <span aria-hidden="true">→</span> best {fmt1(advice.best)}
          {advice.lockedStarters > 0 && <span className="lu-locked"> · {advice.lockedStarters} locked</span>}
        </div>
      </div>
      {better && <SwapList swaps={advice.swaps} />}
      {t && (
        <div className={`lu-tilt is-${t.mode}`}>
          <h4 className="lu-tilt-title mono">
            {t.mode === "ceiling" ? `You're a ${Math.round(t.win * 100)}% underdog: swing for the ceiling` : `You're a ${Math.round(t.win * 100)}% favorite: protect the floor`}
          </h4>
          <p className="lu-tilt-body">
            {t.mode === "ceiling"
              ? `This version adds ${fmt1(t.gain)} to your ceiling lineup and moves your expected points ${t.medianChange >= 0 ? "+" : "−"}${fmt1(Math.abs(t.medianChange))}. A bigger spread is what an underdog needs.`
              : `This version adds ${fmt1(t.gain)} to your floor lineup and moves your expected points ${t.medianChange >= 0 ? "+" : "−"}${fmt1(Math.abs(t.medianChange))}. A narrower spread is what a favorite wants.`}
          </p>
          <SwapList swaps={t.swaps} />
        </div>
      )}
      <p className="standings-note mono">
        Start / sit weighs each player&apos;s floor, median and ceiling (30 / 40 / 30), nudged by Smash and Tough Spots. K, DEF and IDP slots aren&apos;t optimized.
      </p>
    </section>
  );
}

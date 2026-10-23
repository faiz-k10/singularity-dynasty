"use client";

import { useMemo } from "react";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { lineupAdvice, lineupAlerts } from "@/lib/lineupOptimizer";

const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
const slotName = (s) => (s === "SUPER_FLEX" ? "SUPERFLEX" : s);

function Who({ p }) {
  return (
    <span className="lu-who">
      <PositionBadge position={p.position} />
      {p.team && <TeamBadge team={p.team} />}
      <span className="lu-name">{p.name}</span>
    </span>
  );
}

function SwapList({ swaps, key1 = "myProjPts" }) {
  return (
    <ul className="lu-swaps">
      {swaps.map((x) => (
        <li key={`${x.slot}:${x.in.player_id}`} className="lu-swap">
          <span className="lu-slot mono">{slotName(x.slot)}</span>
          <span className="lu-verb mono">Start</span>
          <Who p={x.in} />
          <span className="lu-pts mono">{fmt1(x.in[key1])}</span>
          {x.fromSlot && <span className="lu-from mono">from {slotName(x.fromSlot)}</span>}
          {x.out && (
            <>
              <span className="lu-verb mono">over</span>
              <Who p={x.out} />
              <span className="lu-pts mono">{fmt1(x.out[key1])}</span>
            </>
          )}
          <span className={`lu-gain mono${x.gain < 0 ? " is-neg" : ""}`}>{x.gain >= 0 ? "+" : "−"}{fmt1(Math.abs(x.gain))}</span>
        </li>
      ))}
    </ul>
  );
}

// The "Lineup" tab of a league: the best starters from the roster by this week's projection, who to start over whom and what it
// adds, plus (when the win chance is lopsided) a version that plays for the ceiling or the floor. lib/lineupOptimizer.js does the
// work; players whose game has started are locked and left where they are.
export default function LineupAdvice({ team, gameStates, injuries = [] }) {
  const advice = useMemo(() => lineupAdvice(team, gameStates), [team, gameStates]);
  const alerts = useMemo(() => lineupAlerts(team, gameStates, injuries), [team, gameStates, injuries]);
  const url = team.platform_league_id ? `https://sleeper.com/leagues/${team.platform_league_id}/matchup` : null;
  if (!advice) return <p className="h2h-note">No lineup to optimize for this league this week.</p>;
  const better = advice.swaps.length > 0 && advice.gain >= 0.1;
  const t = advice.tilt;
  return (
    <section className="standings lineup-advice" aria-label="Lineup optimizer">
      <div className="standings-head">
        <span className="standings-note mono">Best lineup by this week&apos;s projection · locked players stay put</span>
      </div>
      <div className="lu-alerts">
        <h4 className="lu-alerts-title mono">
          Lineup alerts{alerts.length > 0 && <span className="lu-alerts-count"> {alerts.length}</span>}
        </h4>
        {alerts.length === 0 ? (
          <p className="lu-alerts-none mono">No alerts: every starter is healthy and in a game this week.</p>
        ) : (
          <ul className="lu-alert-list">
            {alerts.map((a) => (
              <li key={`${a.type}:${a.slot}:${a.player?.player_id || "none"}`} className="lu-alert">
                <span className={`status-dot status-dot-${a.severity}`} aria-hidden="true" />
                <span className="lu-alert-who">
                  {a.player ? <Who p={a.player} /> : <span className="lu-name">Nobody starting</span>}
                  <span className={`status-text status-text-${a.severity}`}>{a.status}</span>
                  <span className="lu-verb mono">in {slotName(a.slot)}</span>
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
              ? `This version adds ${fmt1(t.gain)} to your ceiling lineup and moves your projection ${t.medianChange >= 0 ? "+" : "−"}${fmt1(Math.abs(t.medianChange))}. A bigger spread is what an underdog needs.`
              : `This version adds ${fmt1(t.gain)} to your floor lineup and moves your projection ${t.medianChange >= 0 ? "+" : "−"}${fmt1(Math.abs(t.medianChange))}. A narrower spread is what a favorite wants.`}
          </p>
          <SwapList swaps={t.swaps} key1={t.mode === "ceiling" ? "myCeiling" : "myFloor"} />
        </div>
      )}
      <div className="waivers-foot">
        {url && (
          <a className="h2h-sleeper mono" href={url} target="_blank" rel="noopener noreferrer">
            Set it in Sleeper <span aria-hidden="true">↗</span>
          </a>
        )}
        <span className="standings-note mono">K, DEF and IDP slots aren&apos;t optimized.</span>
      </div>
    </section>
  );
}

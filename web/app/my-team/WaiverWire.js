"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PositionBadge from "../tools/PositionBadge";
import TeamBadge from "../tools/TeamBadge";
import { getWaiverWire } from "./actions";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"];
const SHOWN = 10;
const fmt1 = (v) => (v == null ? "—" : v.toFixed(1));
const adds = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// "Best available" under a league's standings: the QB / RB / WR / TE on no roster in that league, ranked by this week's
// projection (lib/waivers.js via getWaiverWire), with a position filter and Sleeper's trending adds. Loaded when the
// league is opened; free accounts see the available players inside the free top 50 and a count of the rest.
export default function WaiverWire({ teamId }) {
  const [state, setState] = useState({ teamId: null, data: null });
  const [pos, setPos] = useState("All");
  const [more, setMore] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getWaiverWire(teamId)
      .then((data) => !cancelled && setState({ teamId, data }))
      .catch(() => !cancelled && setState({ teamId, data: { error: "Couldn't load available players." } }));
    return () => {
      cancelled = true;
    };
  }, [teamId]);
  const data = state.teamId === teamId ? state.data : null;
  const list = (data?.players || []).filter((p) => pos === "All" || p.pos === pos);
  const shown = more ? list : list.slice(0, SHOWN);
  return (
    <section className="standings waivers" aria-label="Best available players">
      <div className="standings-head">
        <h3 className="board-panel-title">Best available</h3>
        <span className="standings-note mono">On no roster in this league · ranked by this week&apos;s projection</span>
        <div className="board-toggle waivers-pos" role="tablist" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={pos === p} className={pos === p ? "active" : ""} onClick={() => setPos(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <p className="h2h-note">Checking who&apos;s available…</p>
      ) : data.error ? (
        <p className="h2h-note">{data.error}</p>
      ) : list.length === 0 ? (
        <p className="h2h-note">
          {`No ${pos === "All" ? "player" : pos} ${data.full ? "we project this week" : "in the free top 50"} is available here.`}
        </p>
      ) : (
        <div className="standings-wrap">
          <table className="standings-table waivers-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="align-left">Player</th>
                <th className="align-left">Matchup</th>
                <th title="Our median projection this week">Proj</th>
                <th title="Weekly floor to ceiling">Range</th>
                <th title="Rank at his position in this week's projections">Pos rank</th>
                <th title="Times added on Sleeper in the last 24 hours">Trending</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={p.id}>
                  <td className="mono">{i + 1}</td>
                  <td className="align-left">
                    <span className="waivers-player">
                      <span className="standings-team waivers-name">{p.name}</span>
                      <PositionBadge position={p.pos} />
                      <TeamBadge team={p.team} />
                    </span>
                  </td>
                  <td className="align-left mono waivers-dim">{p.opponent ? `${p.isHome === false ? "at" : "vs"} ${p.opponent}` : "—"}</td>
                  <td className="mono waivers-proj">{fmt1(p.proj)}</td>
                  <td className="mono waivers-dim">{p.floor != null && p.ceiling != null ? `${fmt1(p.floor)}–${fmt1(p.ceiling)}` : "—"}</td>
                  <td className="mono">{p.posRank ? `${p.pos} ${p.posRank}` : "—"}</td>
                  <td className="mono">{p.adds > 0 ? <span className="waivers-trend">▲ {adds(p.adds)}</span> : <span className="waivers-dim">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(list.length > SHOWN || (data && !data.full && data.hidden > 0)) && (
        <div className="waivers-foot">
          {list.length > SHOWN && (
            <button type="button" className="sb-drawer-back mono" onClick={() => setMore((m) => !m)}>
              {more ? "Show fewer" : `Show ${list.length - SHOWN} more`}
            </button>
          )}
          {data && !data.full && data.hidden > 0 && (
            <span className="h2h-note">
              {data.hidden} more available {data.hidden === 1 ? "player is" : "players are"} ranked past the free top 50.{" "}
              <Link href="/#pricing" className="h2h-sleeper">
                See every one with Explorer →
              </Link>
            </span>
          )}
        </div>
      )}
    </section>
  );
}

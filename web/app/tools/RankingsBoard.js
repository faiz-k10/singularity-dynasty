"use client";

import { memo, useMemo, useState } from "react";
import TeamBadge from "./TeamBadge";
import PositionBadge from "./PositionBadge";
import AchievementDots from "./AchievementDots";
import useProgressiveCount from "./useProgressiveCount";
import { getAchievementsCached } from "./achievements";
import { PlayerHeaderPanel, PlayerStatsRow, OutcomeCurvePanel, UsageTdPanel, GameLogPanel } from "./WeeklyDetailRow";
import { MyStrip, MyEmpty, mineClass } from "./MyPlayers";
import { isBye, BYE_LABEL } from "@/lib/bye";

// The Board view of Weekly Projection Rankings: a headline strip of this week's big numbers, a ranked list (one scoreboard line a player) and
// a detail pane that shows the opened player's whole dashboard beside the list instead of pushing the table down. It reads the SAME rows the
// table does (already filtered by RankingsSearch) and reuses the opened-player panels from WeeklyDetailRow, so a number can't differ between
// the two views.

const keyOf = (r) => `${r.position}-${r.rank}`;

function Strip({ rows, ownedByName }) {
  const s = useMemo(() => {
    let top = null, roof = null, smash = 0, tough = 0, mineN = 0, mineOut = 0;
    for (const r of rows) {
      if (isBye(r.opponent)) continue;
      if (r.projection != null && (!top || r.projection > top.projection)) top = r;
      if (r.ceiling != null && (!roof || r.ceiling > roof.ceiling)) roof = r;
      if (r.defLean?.call === "SMASH") smash++;
      else if (r.defLean?.call === "TOUGH") tough++;
      if (ownedByName?.has(r.player_name)) {
        mineN++;
        if (/\bOUT\b/.test(r.notes || "")) mineOut++;
      }
    }
    return { top, roof, smash, tough, mineN, mineOut };
  }, [rows, ownedByName]);
  const cell = (n, label, sub, tone) => (
    <div className="board-strip-cell">
      <div className={`board-strip-n${tone ? ` is-${tone}` : ""}`}>{n}</div>
      <div className="board-strip-l">{label}</div>
      {sub && <div className="board-strip-s">{sub}</div>}
    </div>
  );
  return (
    <div className="board-strip">
      {cell(rows.length, "Players ranked")}
      {cell(s.top ? s.top.projection.toFixed(1) : "—", "Top projection", s.top && `${s.top.player_name} · ${s.top.position}`)}
      {cell(s.roof ? s.roof.ceiling.toFixed(1) : "—", "Highest ceiling", s.roof && `${s.roof.player_name} · ${s.roof.position}`, "down")}
      {cell(s.smash, "Smash Spots", `${s.tough} Tough Spots`, "up")}
      {ownedByName && ownedByName.size > 0 ? cell(s.mineN, "Your players", s.mineOut ? `${s.mineOut} listed out` : "none listed out") : cell(s.tough, "Tough Spots", "avoid this week")}
    </div>
  );
}

const BoardRow = memo(function BoardRow({ row, selected, onPick, scale, owned }) {
  const bye = isBye(row.opponent);
  const hasRange = !bye && row.floor != null && row.ceiling != null && row.projection != null;
  const ach = hasRange ? getAchievementsCached(row) : [];
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const sep = row.is_home === true ? "vs" : row.is_home === false ? "@" : "·";
  return (
    <div
      className={`board-row${selected ? " is-selected" : ""}${!bye && row.displayRank <= 3 ? " is-top" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onPick(keyOf(row))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(keyOf(row));
        }
      }}
    >
      <span className="board-rank">{bye ? "—" : row.displayRank}</span>
      <span className="board-who">
        <span className="board-name-line">
          <TeamBadge team={row.team} />
          <b className={`board-name${mineClass(owned)}`}>{row.player_name}</b>
          <PositionBadge position={row.position} />
          {row.positionLabel && row.positionLabel !== row.position && !bye && <span className="board-posrank">{row.positionLabel.slice(row.position.length)}</span>}
          <AchievementDots achievements={ach} />
        </span>
        <span className="board-sub">
          {isBye(row.opponent) ? (
            <span className="board-bye">{BYE_LABEL}</span>
          ) : (
            <>
              {sep} {row.opponent}
            </>
          )}
        </span>
      </span>
      <span className="board-med">{bye || row.projection == null ? "—" : Number(row.projection).toFixed(1)}</span>
      <span className="board-range">
        {hasRange && (
          <>
            <span className="board-led">
              <i style={{ width: pct(row.projection) }} />
              <b style={{ left: pct(row.ceiling) }} />
            </span>
            <span className="board-led-n">
              <span>{Number(row.floor).toFixed(1)}</span>
              <span>{Number(row.ceiling).toFixed(1)}</span>
            </span>
          </>
        )}
      </span>
    </div>
  );
});

function Detail({ row, maxSpread, owned, mineStatus }) {
  const mine = (owned || mineStatus) && (
    <div className="stat-panel weekly-detail-mine-panel">{owned ? <MyStrip owned={owned} vertical /> : <MyEmpty status={mineStatus} />}</div>
  );
  return (
    <div className="board-detail-body weekly-detail-wrap-board">
      <PlayerHeaderPanel row={row} share />
      <div className="weekly-detail-grid">
        <div className="weekly-detail-col">
          <PlayerStatsRow row={row} />
          <OutcomeCurvePanel row={row} maxSpread={maxSpread} />
          {mine}
          <UsageTdPanel row={row} />
          <GameLogPanel games={row.recentGames} />
        </div>
      </div>
    </div>
  );
}

export default function RankingsBoard({ rows, allRows, maxSpread, ownedByName, mineStatus, toolbar, myViewOn, gated }) {
  const [pickedKey, setPickedKey] = useState(null);
  const mounted = useProgressiveCount(rows.length, 40, 80);
  const scale = useMemo(() => Math.max(10, ...rows.map((r) => r.ceiling || 0)), [rows]);
  // The pane shows the picked player while he is still in the filtered list, else the first one on it.
  const selected = rows.find((r) => keyOf(r) === pickedKey) || rows[0] || null;
  const selectedKey = selected ? keyOf(selected) : null;
  return (
    <>
      <Strip rows={allRows} ownedByName={ownedByName} />
      <div className="rankings-theater-bar">
        <div className="rankings-theater-controls">{toolbar}</div>
      </div>
      <div className="board-shell">
        <div className="board-list glass-panel" role="list" aria-label="Ranked players">
          <div className="board-list-head">
            <span>#</span>
            <span>Player</span>
            <span>Median</span>
            <span>Floor to ceiling</span>
          </div>
          <div className="board-list-rows">
            {rows.slice(0, mounted).map((r) => (
              <BoardRow key={keyOf(r)} row={r} selected={keyOf(r) === selectedKey} onPick={setPickedKey} scale={scale} owned={ownedByName?.get(r.player_name)} />
            ))}
            {rows.length === 0 && (
              <p className="rankings-table-empty">
                {myViewOn ? (gated ? "None of your players are in the free view — the full list unlocks with Explorer." : "None of your players are in this list.") : "No players match."}
              </p>
            )}
          </div>
        </div>
        <div className="board-detail glass-panel" aria-live="polite">
          {selected ? (
            <Detail key={selectedKey} row={selected} maxSpread={maxSpread} owned={ownedByName?.get(selected.player_name)} mineStatus={mineStatus} />
          ) : (
            <p className="rankings-table-empty">Pick a player to see his week.</p>
          )}
        </div>
      </div>
    </>
  );
}

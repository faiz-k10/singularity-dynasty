"use client";

import { useState } from "react";

const SHOWN = 6;
const ICON = { up: "▲", down: "▼", flag: "⚑" };

// "Your players this week": what moved for the players on the user's saved teams since the
// previous published week (computed on the server -- lib/myFeed.js). A ranked list of one-line
// cards, starters first, not a report.
export default function MyWeekFeed({ feed }) {
  const [team, setTeam] = useState("all");
  const [showAll, setShowAll] = useState(false);

  if (!feed) {
    return <p className="tool-notes">Your weekly changes will show up here after the page reloads.</p>;
  }
  if (!feed.ready) {
    return <p className="tool-notes">Changes appear once a second week of projections is published.</p>;
  }
  const data = team === "all" ? feed.all : feed.byTeam[Number(team)];
  const items = data?.items || [];
  const shown = showAll ? items : items.slice(0, SHOWN);

  let headline;
  if (!items.length) headline = "Quiet week — nothing moved for your players";
  else {
    const parts = [];
    if (data.starters) parts.push(`${data.starters} of your starters moved`);
    if (data.bench) parts.push(`${data.bench} on your bench`);
    headline = parts.join(", ");
  }

  return (
    <div className="week-feed">
      <div className="week-feed-top">
        <div className="week-feed-headline">{headline}</div>
        {feed.teams.length > 1 && (
          <select className="my-filter-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Which of your teams">
            <option value="all">All my teams</option>
            {feed.teams.map((t, i) => (
              <option key={i} value={String(i)}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="week-feed-list">
        {shown.map((it) => {
          const [main, ...rest] = it.lines;
          return (
            <div className="week-card" key={it.name}>
              <span className={`week-card-icon ${main.dir}`} aria-hidden="true">
                {ICON[main.dir]}
              </span>
              <div className="week-card-body">
                <div className="week-card-name">
                  {it.name}
                  {it.position && <span className="week-card-pos">{it.position}</span>}
                </div>
                <div className="week-card-line">{main.text}</div>
                {rest.map((l, i) => (
                  <div className="week-card-line week-card-line-more" key={i}>
                    {l.text}
                  </div>
                ))}
              </div>
              <div className="week-card-where">
                <span className={`week-card-role${it.starter ? " starter" : ""}`}>{it.starter ? "starter" : "bench"}</span>
                <span className="week-card-teams">{it.teams.map((t) => t.label).join(" · ")}</span>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > SHOWN && (
        <button type="button" className="week-feed-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show ${items.length - SHOWN} more`}
        </button>
      )}
      <div className="week-feed-foot">Injuries and news are in their own panel.</div>
    </div>
  );
}

import Link from "next/link";
import Greeting from "./Greeting";
import { loadFeedInputs, buildTeamsFeed } from "@/lib/myFeedData";
import { fmt1, fmt2 } from "@/lib/format";
import { formatWin } from "@/lib/standing";
import { leadState } from "@/lib/leadState";
import { weekRows, displayName, weekBriefing, splitNames } from "@/lib/briefing";

// The home page for a signed-in member with saved leagues: a briefing on their week first -- a greeting, a sync line, one or two plain
// sentences on how the week stands (lib/briefing.js), then every league's matchup in one aligned table (score or projection, the
// one-word reading, win chance and a meter) and the biggest changes for their players since last week -- with the Game Board one
// click away. Its right-hand side is the gravity map (GravityMap.js). The sales hero is for everyone else. Server component; reads the
// member's own rows through their session (RLS).

export async function loadYourWeek(supabase, user) {
  const { data: teams } = await supabase
    .from("saved_teams")
    .select("id, league_name, team_name, settings, players, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (!teams?.length) return null;
  const feed = buildTeamsFeed(teams, await loadFeedInputs().catch(() => null));
  return { teams, feed, rows: weekRows(teams), name: displayName(teams) };
}

const SHOWN = 8;

function Row({ r }) {
  if (r.bye) {
    return (
      <tr className="yw-tr is-bye">
        <th scope="row">
          <span className="yw-league">{r.name}</span>
          <span className="yw-sub mono">{r.record ? `${r.record} · ` : ""}Bye week</span>
        </th>
        <td colSpan={3} />
      </tr>
    );
  }
  const [me, them] = r.live ? leadState(r.mine, r.opp) : [null, null];
  const num = (v) => (v == null ? "—" : r.live ? fmt2(v) : fmt1(v));
  return (
    <tr className={`yw-tr${r.live ? "" : " is-proj"}`}>
      <th scope="row">
        <span className="yw-league">{r.name}</span>
        <span className="yw-sub mono">
          {r.record && <span className="yw-record">{r.record}</span>}
          <span className="yw-opp">vs {r.opponent || "—"}</span>
        </span>
      </th>
      <td className={`yw-num${me ? ` is-${me}` : ""}`} data-label={r.live ? "You" : "You · proj"}>{num(r.mine)}</td>
      <td className={`yw-num${them ? ` is-${them}` : ""}`} data-label="Them">{num(r.opp)}</td>
      <td className={`yw-chance is-${r.tone || "grey"}`} data-label="Chance">
        {r.p != null ? (
          <>
            <span className="yw-chance-row">
              <span className="yw-chance-word">{r.label}</span>
              <span className="yw-chance-pct">{formatWin(r.p)}</span>
            </span>
            <span className="yw-meter" style={{ "--p": r.p }} aria-hidden="true" />
          </>
        ) : (
          <span className="yw-chance-word">—</span>
        )}
      </td>
    </tr>
  );
}

export default function YourWeek({ data }) {
  const { teams, feed, rows, name } = data;
  const week = teams.find((t) => t.settings?.week)?.settings.week;
  const changes = (feed?.ready ? feed.all.items : []).slice(0, 4);
  const anyLive = rows.some((r) => r.live);
  return (
    <div className="yw">
      <div className="yw-head" aria-label={week ? `Week ${week}` : "Your week"}>
        <b className="yw-week-num" aria-hidden="true">
          {week ? `WEEK ${String(week).padStart(2, "0")}` : "YOUR WEEK"}
        </b>
      </div>
      <Greeting name={name} />
      <p className="yw-brief">
        {splitNames(weekBriefing(rows), rows.map((r) => r.name)).map((part, i) =>
          part.name ? (
            <span key={i} className="yw-brief-name">
              {part.text}
            </span>
          ) : (
            part.text
          )
        )}
      </p>

      <section aria-labelledby="yw-matchups">
        <table className="yw-table">
          <caption id="yw-matchups" className="yw-h2 mono">Your matchups</caption>
          <thead>
            <tr>
              <th scope="col">League</th>
              <th scope="col" className="yw-num">{anyLive ? "You" : "You · proj"}</th>
              <th scope="col" className="yw-num">Them</th>
              <th scope="col" className="yw-chance">Chance</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, SHOWN).map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </tbody>
        </table>
        {teams.length > SHOWN && <p className="yw-more mono">+ {teams.length - SHOWN} more on your Game Board</p>}
      </section>

      {changes.length > 0 && (
        <section aria-labelledby="yw-changes">
          <h2 id="yw-changes" className="yw-h2 mono">Since week {feed.prevWeek}</h2>
          <ul className="yw-changes">
            {changes.map((it) => (
              <li key={it.name} className={`yw-change is-${it.lines[0].dir}`}>
                <strong>{it.name}</strong> <span>{it.lines[0].plain || it.lines[0].text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="yw-actions">
        <Link href="/my-team" className="btn-primary">
          Open Game Board
        </Link>
        <Link href="/tools/redraft-rankings" className="btn-ghost">
          Weekly Rankings
        </Link>
      </div>
    </div>
  );
}

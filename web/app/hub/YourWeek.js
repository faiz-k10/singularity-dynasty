import Link from "next/link";
import { loadFeedInputs, buildTeamsFeed } from "@/lib/myFeedData";
import { leagueName, fmt1, fmt2 } from "@/lib/format";
import { standing, formatWin } from "@/lib/standing";

// The home page for a signed-in member with saved leagues: their week first -- each league's matchup (score or projection,
// the one-word reading and win chance from the saved snapshot) and the top changes for their players since last week --
// with the Game Board one click away. The sales hero is for everyone else. Server component; reads the member's own rows
// through their session (RLS).
const TONE = { mint: "is-mint", red: "is-red", grey: "is-grey" };

export async function loadYourWeek(supabase, user) {
  const { data: teams } = await supabase
    .from("saved_teams")
    .select("id, league_name, team_name, settings, players, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (!teams?.length) return null;
  const feed = buildTeamsFeed(teams, await loadFeedInputs().catch(() => null));
  return { teams, feed };
}

function Matchup({ t }) {
  const s = t.settings || {};
  const name = leagueName(t, "League");
  if (s.isBye) {
    return (
      <li className="yw-row">
        <span className="yw-league">{name}</span>
        <span className="yw-score mono">Bye week</span>
      </li>
    );
  }
  const live = s.matchupActual && (s.matchupActual.mine > 0 || s.matchupActual.opp > 0);
  const mine = live ? fmt2(s.matchupActual.mine) : s.matchupProj ? fmt1(s.matchupProj.mine) : null;
  const opp = live ? fmt2(s.matchupActual.opp) : s.matchupProj ? fmt1(s.matchupProj.opp) : null;
  const st = standing(s.winChance ?? null, false);
  return (
    <li className="yw-row">
      <span className="yw-league">
        <span className="yw-name">{name}</span>
        {s.record && <span className="yw-record mono">{s.record}</span>}
      </span>
      <span className="yw-opp">vs {s.opponent || "—"}</span>
      <span className="yw-score mono">
        {mine != null ? (
          <>
            {mine} <span className="yw-dim">–</span> {opp}
            {!live && <span className="yw-dim"> proj</span>}
          </>
        ) : (
          "—"
        )}
      </span>
      <span className={`yw-read mono ${TONE[st.tone] || ""}`}>
        {st.label ? `${st.label} · ${formatWin(s.winChance)}` : ""}
      </span>
    </li>
  );
}

export default function YourWeek({ data }) {
  const { teams, feed } = data;
  const week = teams.find((t) => t.settings?.week)?.settings.week;
  const changes = (feed?.ready ? feed.all.items : []).slice(0, 4);
  const updated = teams.reduce((m, t) => Math.max(m, Date.parse(t.updated_at) || 0), 0);
  return (
    <div className="yw">
      <div className="eyebrow">{week ? `Week ${week}` : "Your week"}</div>
      <h1 className="yw-h1">Welcome back.</h1>
      <section aria-labelledby="yw-matchups">
        <h2 id="yw-matchups" className="yw-h2 mono">Your matchups</h2>
        <ul className="yw-list">
          {teams.slice(0, 8).map((t) => (
            <Matchup key={t.id} t={t} />
          ))}
        </ul>
        {teams.length > 8 && <p className="yw-more mono">+ {teams.length - 8} more on your Game Board</p>}
      </section>
      {changes.length > 0 && (
        <section aria-labelledby="yw-changes">
          <h2 id="yw-changes" className="yw-h2 mono">Since week {feed.prevWeek}</h2>
          <ul className="yw-changes">
            {changes.map((it) => (
              <li key={it.name} className={`yw-change is-${it.lines[0].dir}`}>
                <strong>{it.name}</strong> <span>{it.lines[0].text}</span>
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
      {updated > 0 && <p className="yw-foot mono">From your leagues as of {new Date(updated).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET. The Game Board updates live.</p>}
    </div>
  );
}

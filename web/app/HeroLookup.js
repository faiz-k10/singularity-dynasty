"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { lookupSleeperTeams } from "./my-team/actions";
import { summarizeLeagues } from "@/lib/heroLookup";

// The landing page's one action: enter a Sleeper username, see your leagues and one real insight (the players you own
// in more than one league with this week's projection, and how many of this week's matchups we project you win), then
// "Save your leagues" -- which asks for an account. The lookup is the same public, no-account server action My Team uses.
export default function HeroLookup({ signedIn }) {
  const [username, setUsername] = useState("");
  const [summary, setSummary] = useState(null);
  const [leagueNames, setLeagueNames] = useState([]);
  const [shownName, setShownName] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function submit(e) {
    e.preventDefault();
    const name = username.trim();
    if (!name || pending) return;
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const res = await lookupSleeperTeams(name);
        if (res.error) {
          setError(res.error);
          return;
        }
        setSummary(summarizeLeagues(res.teams));
        setLeagueNames((res.teams || []).map((t) => ({ name: t.league_name, record: t.settings?.record, format: [t.settings?.qbFormat, t.settings?.scoring].filter(Boolean).join(" ") })));
        setShownName(res.sleeperUsername || name);
        try {
          localStorage.setItem("sd-sleeper-user", res.sleeperUsername || name);
        } catch {}
      } catch {
        setError("Couldn't reach Sleeper just now. Try again in a moment.");
      }
    });
  }

  const ctaHref = signedIn ? "/my-team" : "/login?next=/my-team";
  const m = summary?.matchups;

  return (
    <div className="hero-lookup">
      <form className="hero-lookup-form" onSubmit={submit}>
        <label htmlFor="hero-sleeper" className="hero-lookup-label">
          Your Sleeper username
        </label>
        <div className="hero-lookup-row">
          <input
            id="hero-sleeper"
            className="hero-lookup-input"
            type="text"
            placeholder="e.g. yourusername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button type="submit" className="btn-primary hero-lookup-btn" disabled={pending || !username.trim()}>
            {pending ? "Pulling leagues…" : "Check my leagues"}
          </button>
        </div>
        <p className="hero-lookup-note">Free · no account needed to look · we only read your public Sleeper leagues</p>
      </form>

      {error && <p className="hero-lookup-error mono">{error}</p>}

      {summary && summary.leagues > 0 && (
        <div className="hero-lookup-result" aria-live="polite">
          <p className="hero-lookup-found">
            Found <b>{summary.leagues}</b> {summary.leagues === 1 ? "league" : "leagues"} for <b>{shownName}</b>
            {summary.formats[0] && <span> · mostly {summary.formats[0].label}</span>}
          </p>

          {m && m.projected > 0 && (
            <p className="hero-lookup-insight">
              We project you win <b>{m.wins}</b> of {m.projected} {m.projected === 1 ? "matchup" : "matchups"} this week.
            </p>
          )}

          {summary.exposure.length > 0 ? (
            <div className="hero-lookup-exposure">
              <span className="hero-lookup-sub">Your biggest exposure</span>
              <ul>
                {summary.exposure.map((e) => (
                  <li key={e.name}>
                    <span className="hero-lookup-pname">
                      {e.name} <i>{e.position}</i>
                    </span>
                    <span className="hero-lookup-pleagues">
                      in {e.leagues} of {summary.leagues}
                    </span>
                    <span className="hero-lookup-pproj">{e.proj != null ? `${e.proj.toFixed(1)} proj` : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="hero-lookup-leagues">
              {leagueNames.slice(0, 4).map((l, i) => (
                <li key={`${l.name}-${i}`}>
                  {l.name} <i>{l.format}</i>
                </li>
              ))}
            </ul>
          )}

          <Link href={ctaHref} className="btn-primary hero-lookup-cta">
            {signedIn ? "Open my leagues" : "Save your leagues — free"}
          </Link>
          <Link href="/#tools" className="hero-lookup-more">
            or explore the tools →
          </Link>
        </div>
      )}

      {!summary && !error && (
        <Link href="/#tools" className="hero-lookup-more">
          or explore the tools →
        </Link>
      )}
    </div>
  );
}

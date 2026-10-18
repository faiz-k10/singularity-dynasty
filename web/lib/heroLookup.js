// Pure summary of a Sleeper lookup (the teams returned by app/my-team/actions.js lookupSleeperTeams) for the landing
// page's hero box: how many leagues, the format mix, the players he owns in more than one league, and how many of this
// week's matchups our projections favor. No React, no network -- unit-tested.

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

export function summarizeLeagues(teams, { exposureLimit = 3 } = {}) {
  const list = Array.isArray(teams) ? teams : [];
  const leagues = list.length;

  const mix = new Map();
  for (const t of list) {
    const key = [t.settings?.qbFormat, t.settings?.scoring].filter(Boolean).join(" ");
    if (key) mix.set(key, (mix.get(key) || 0) + 1);
  }
  const formats = [...mix.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));

  const owned = new Map();
  for (const t of list) {
    const seen = new Set();
    for (const p of t.players || []) {
      const k = norm(p.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const e = owned.get(k) || { name: p.name, position: p.position, team: p.team, leagues: 0, proj: null, starts: 0 };
      e.leagues += 1;
      if (typeof p.myProjPts === "number") e.proj = p.myProjPts;
      if (p.isStarter) e.starts += 1;
      owned.set(k, e);
    }
  }
  const exposure = [...owned.values()]
    .filter((e) => e.leagues >= 2)
    .sort((a, b) => b.leagues - a.leagues || (b.proj ?? -1) - (a.proj ?? -1))
    .slice(0, exposureLimit);

  let wins = 0;
  let projected = 0;
  for (const t of list) {
    const m = t.settings?.matchupProj;
    if (m && typeof m.mine === "number" && typeof m.opp === "number") {
      projected += 1;
      if (m.mine > m.opp) wins += 1;
    }
  }

  return { leagues, formats, exposure, matchups: { projected, wins } };
}

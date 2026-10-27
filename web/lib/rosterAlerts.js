// Lineup alerts and the news panel's "starts in" lists, recomputed in the browser from the CURRENT saved rosters
// (after a refresh, or once the live poll notices a lineup change) instead of from the copy the server read when it
// fetched the injury feed. Without this, benching a Questionable / Out player in Sleeper left the alert up until the
// next feed poll happened to land after a refresh.
//
// news: getRosterNews()'s result -- items (each with its roster `key`), statusByKey ({key: {status, severity}} for every
// rostered player carrying a designation), byTeam (the server's own version, used only when statusByKey is missing).
import { normalizePlayerName } from "./portfolio.js";
import { leagueName } from "./format.js";

export const rosterKey = (name, position) => `${normalizePlayerName(name)}|${position}`;

export function liveRosterNews(savedTeams, news) {
  if (!news || !news.statusByKey) return news;
  const byTeam = {};
  const starts = new Map();
  const rosters = new Map();
  for (const t of savedTeams || []) {
    const label = leagueName(t);
    for (const p of t.players || []) {
      const key = rosterKey(p.name, p.position);
      if (!rosters.has(key)) rosters.set(key, []);
      rosters.get(key).push(label);
      if (!p.isStarter) continue;
      if (!starts.has(key)) starts.set(key, []);
      starts.get(key).push(label);
      const s = news.statusByKey[key];
      if (s && s.severity > 0) (byTeam[t.id] ??= []).push({ name: p.name, status: s.status, severity: s.severity });
    }
  }
  const items = (news.items || [])
    .filter((it) => !it.key || rosters.has(it.key))
    .map((it) => (it.key ? { ...it, starts: starts.get(it.key) || [], rosters: rosters.get(it.key) || [] } : it));
  return { ...news, items, byTeam };
}

// Starter ids per saved team from the live poll vs. what the saved rosters say. True when any team's lineup changed
// (the poll then triggers a full refresh so the lineup, alerts and projections all catch up).
export function lineupChanged(savedTeams, lineups) {
  if (!lineups) return false;
  for (const t of savedTeams || []) {
    const ids = lineups[t.id];
    if (!ids) continue;
    const now = new Set(ids.map(String));
    const saved = new Set((t.players || []).filter((p) => p.isStarter).map((p) => String(p.player_id)));
    if (now.size !== saved.size) return true;
    for (const id of now) if (!saved.has(id)) return true;
  }
  return false;
}

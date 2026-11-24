// A Sleeper dynasty / keeper league that renews for a new season becomes a NEW league with a new id; the new league names the old one
// in `previous_league_id`. A member's saved team still points at the old id, so on a refresh it is moved to the renewed league (same
// saved_teams row: buy-in, snapshots history and its place among the plan's live leagues are kept). Pure; tested in
// test/leagueRenewal.test.mjs. (Nov 23 2026, before the first renewals in February 2027.)
//
// savedIds: every league id the member has saved. fresh: this season's leagues from the lookup ({ league_id, previous_league_id, ... }).
// ancestorsOf(leagueId): every earlier league id of that league, nearest first (previous_league_id, its previous, ...), when known.
// Returns Map(old saved id -> fresh team) for the saved leagues that renewed. A renewed league the member has ALSO saved separately is
// left alone (the unique league id would clash, and both rows are the member's own choice).
export function findRenewals(savedIds, fresh, ancestorsOf = (id) => []) {
  const saved = new Set(savedIds.map(String));
  const out = new Map();
  for (const t of fresh) {
    const id = String(t.league_id);
    if (saved.has(id)) continue; // already saved under its current id: nothing to move
    const chain = [t.previous_league_id, ...(ancestorsOf(id) || [])].filter((x) => x != null && x !== "0").map(String);
    const old = chain.find((x) => saved.has(x) && !out.has(x));
    if (old) out.set(old, t);
  }
  return out;
}

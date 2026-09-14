import { getInsight } from "./registry";

const TABLE_BY_SCOPE = { user: "user_insights", team: "team_insights" };

// Runs a registered insight's compute() against `input` and upserts the
// result to its scope's table. `supabase` is whatever client the caller
// already has (a request-scoped, RLS-respecting client for a real user
// action -- there's no reason for insight computation to need the admin
// client, since it only ever writes the calling user's own rows).
export async function computeAndSaveInsight(supabase, { key, userId, savedTeamId, input }) {
  const def = getInsight(key);
  const value = await def.compute(input);
  const table = TABLE_BY_SCOPE[def.scope];

  const row = { user_id: userId, insight_key: key, value, computed_at: new Date().toISOString() };
  let onConflict = "user_id,insight_key";
  if (def.scope === "team") {
    if (!savedTeamId) throw new Error(`Insight "${key}" is team-scoped and needs a savedTeamId`);
    row.saved_team_id = savedTeamId;
    onConflict = "saved_team_id,insight_key";
  }

  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) throw error;
  return value;
}

// Reads back a previously-computed insight (or null if it's never been
// computed for this user/team). Callers that just need last-computed
// output -- rendering a badge, say -- use this instead of recomputing on
// every page view.
export async function loadInsight(supabase, { key, userId, savedTeamId }) {
  const def = getInsight(key);
  const table = TABLE_BY_SCOPE[def.scope];
  let query = supabase
    .from(table)
    .select("value, computed_at")
    .eq("user_id", userId)
    .eq("insight_key", key);
  if (def.scope === "team") query = query.eq("saved_team_id", savedTeamId);

  const { data } = await query.maybeSingle();
  return data || null;
}

// Batched variant of loadInsight for scope:"team" insights across every
// saved team at once (what the My Team page needs) -- one query instead
// of one per team. Returns a Map keyed by saved_team_id.
export async function loadTeamInsightForAll(supabase, { key, userId, savedTeamIds }) {
  const result = new Map();
  if (!savedTeamIds || savedTeamIds.length === 0) return result;
  const def = getInsight(key);
  if (def.scope !== "team") throw new Error(`Insight "${key}" is not team-scoped`);

  const { data } = await supabase
    .from("team_insights")
    .select("saved_team_id, value, computed_at")
    .eq("user_id", userId)
    .eq("insight_key", key)
    .in("saved_team_id", savedTeamIds);

  for (const row of data || []) {
    result.set(row.saved_team_id, { value: row.value, computed_at: row.computed_at });
  }
  return result;
}

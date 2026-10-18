// Pure tier-policy constants + helpers, no Supabase/Next imports so this
// stays unit-testable (test/tierLimits.test.mjs). tier.js re-exports these
// alongside the DB-touching resolveTier()/getUserTier().

// How many teams each tier can save in /my-team. null = unlimited.
// Mirrored by the DB trigger (0024_saved_teams_tier_limit.sql, raised for Explorer by 0037_explorer_team_cap.sql) --
// keep the two in sync. Stargazer 1, Explorer 10, Singularity unlimited, matching the pricing copy. The ladder is the
// usual league-sync one (FantasyPros caps active leagues per plan too): 10 covers the engaged multi-league player
// we sell Explorer to, so unlimited is a reason to move up to Singularity, not a reason to skip Explorer.
export const SAVED_TEAM_LIMITS = {
  stargazer: 1,
  explorer: 10,
  singularity: null,
};

// Returns the cap for a tier, or null for unlimited. Must use an `in`
// check, not `?? stargazer` -- `null` is a real value in the map
// (unlimited) and `??` would wrongly replace it with the stargazer cap.
export function savedTeamLimit(tier) {
  return tier in SAVED_TEAM_LIMITS ? SAVED_TEAM_LIMITS[tier] : SAVED_TEAM_LIMITS.stargazer;
}

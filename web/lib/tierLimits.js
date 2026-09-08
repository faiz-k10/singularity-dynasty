// Pure tier-policy constants + helpers, no Supabase/Next imports so this
// stays unit-testable (test/tierLimits.test.mjs). tier.js re-exports these
// alongside the DB-touching resolveTier()/getUserTier().

// How many teams each tier can save in /my-team. null = unlimited.
// Mirrored by the DB trigger in 0024_saved_teams_tier_limit.sql -- keep
// the two in sync. Stargazer 1, Explorer/Singularity unlimited, matching
// the pricing copy ("no ceiling on teams" for Explorer).
export const SAVED_TEAM_LIMITS = {
  stargazer: 1,
  explorer: null,
  singularity: null,
};

// Returns the cap for a tier, or null for unlimited. Must use an `in`
// check, not `?? stargazer` -- `null` is a real value in the map
// (unlimited) and `??` would wrongly replace it with the stargazer cap.
export function savedTeamLimit(tier) {
  return tier in SAVED_TEAM_LIMITS ? SAVED_TEAM_LIMITS[tier] : SAVED_TEAM_LIMITS.stargazer;
}

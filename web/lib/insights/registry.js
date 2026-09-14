// Central registry for personalization "insights" -- see
// supabase/migrations/0030_insights.sql for why the persistence layer
// underneath this is generic (two tables keyed by insight_key, no
// per-feature schema). A brand new personalized feature is: one module
// in this directory exporting a compute() function, one registerInsight()
// call in ./index.js, and nothing else -- no migration, no change to
// existing insights, no change to persist.js. That's the "malleable"
// property this whole layer exists for.
const registry = new Map();

// scope:"user"   -- one result per signed-in user (e.g. a quiz result).
// scope:"team"   -- one result per saved team (e.g. a per-league badge).
// compute(input) may be async; it should be a pure function of `input`
// (never reach into Supabase itself) so it stays trivially testable and
// reusable outside a request context.
export function registerInsight({ key, scope, compute }) {
  if (!key || (scope !== "user" && scope !== "team") || typeof compute !== "function") {
    throw new Error(`registerInsight: invalid definition for "${key}"`);
  }
  registry.set(key, { key, scope, compute });
}

export function getInsight(key) {
  const def = registry.get(key);
  if (!def) throw new Error(`No insight registered for key "${key}"`);
  return def;
}

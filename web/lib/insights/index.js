// Registers every built-in insight, then re-exports the registry/persist
// API. Anything that needs to compute or read an insight imports from
// "@/lib/insights" (this file) rather than reaching into registry.js or
// an individual insight module directly -- that's what guarantees a
// module actually gets registered before anything tries to use it.
//
// Adding a new personalized feature: write ./newThing.js exporting a
// compute() function, add one registerInsight() call below. Nothing else
// in the app changes.
import { registerInsight } from "./registry";
import { computeGmArchetype } from "./gmArchetype";
import { computeSeasonRecordBadge } from "./seasonRecord";

registerInsight({ key: "gm_archetype_quiz", scope: "user", compute: computeGmArchetype });
registerInsight({ key: "season_record_badge", scope: "team", compute: computeSeasonRecordBadge });

export * from "./registry";
export * from "./persist";
export { GM_ARCHETYPE_QUESTIONS, scoreGmArchetype } from "./gmArchetype";

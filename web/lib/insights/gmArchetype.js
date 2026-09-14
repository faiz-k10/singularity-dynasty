// Self-report GM Archetype quiz -- stage one of the two-stage Archetype
// design: a quick, no-roster-required quiz gives an immediate identity
// label (works for a brand new signed-in visitor who hasn't imported a
// team yet). Stage two -- scoring a user's ACTUAL roster the same way,
// from real age/variance/depth data, and comparing it against what they
// said about themselves here -- is a separate scope:"team" insight to
// add later, once model/player_meta.R is actually published to Supabase
// (see CLAUDE.md's Team Analysis gap list; it isn't yet). Not part of
// this bare-bones pass, but this module's shape doesn't need to change
// when that lands -- it's just one more registered insight.

export const GM_ARCHETYPE_QUESTIONS = [
  {
    key: "window",
    prompt: "Your team just missed the playoffs by one game. What now?",
    options: [
      { value: 2, label: "Trade picks for proven vets — we're close." },
      { value: 1, label: "Run it back, see how the young guys grow." },
      { value: -1, label: "Sell a vet or two while the price is high." },
      { value: -2, label: "Full teardown — stack picks for next year." },
    ],
  },
  {
    key: "riskInDraft",
    prompt: "Rookie draft, same tier left: a boom/bust ceiling monster, or a safe every-week starter?",
    options: [
      { value: 2, label: "Ceiling, every time." },
      { value: 1, label: "Leaning ceiling, but it depends on the player." },
      { value: -1, label: "Leaning safe." },
      { value: -2, label: "Give me the floor — I sleep better." },
    ],
  },
  {
    key: "tradeStyle",
    prompt: "A leaguemate offers a 1-for-1 that's close in value. Your gut reaction?",
    options: [
      { value: 2, label: "I'm doing this trade — I love making moves." },
      { value: 1, label: "I'll consider it if it clearly helps my timeline." },
      { value: -1, label: "Probably not, I don't love changing my roster." },
      { value: -2, label: "Hard pass — I'd rather develop what I have." },
    ],
  },
  {
    key: "benchStash",
    prompt: "A deep-league flier with a wide range of outcomes is on your bench all season. Cut him for a safer body, or hold?",
    options: [
      { value: 2, label: "Hold — the upside is worth the roster spot." },
      { value: -2, label: "Cut him — I want reliability on my bench too." },
    ],
  },
];

// Combined score across all questions runs roughly -8..+8. Positive =
// aggressive/ceiling-chasing, negative = patient/floor-safe. A single
// collapsed axis for this v1 -- a real two-axis grid (aggression x risk)
// is a natural v2 once there's a UI worth building for it, not a
// reason to hold up v1.
const ARCHETYPES = [
  { max: -4, key: "patient_architect", label: "The Patient Architect", blurb: "You build for three years from now, not three weeks from now." },
  { max: -1, key: "steady_hand", label: "The Steady Hand", blurb: "You favor the safe, repeatable outcome over the home run swing." },
  { max: 2, key: "opportunist", label: "The Opportunist", blurb: "You'll make a move when the value is right, but you're not chasing upside for its own sake." },
  { max: 5, key: "win_now_aggressor", label: "The Win-Now Aggressor", blurb: "Your window is open, and you're spending everything to keep it that way." },
  { max: Infinity, key: "boom_bust_gambler", label: "The Boom/Bust Gambler", blurb: "You'd rather swing for a title than play it safe for a playoff berth." },
];

export function scoreGmArchetype(answers) {
  const total = GM_ARCHETYPE_QUESTIONS.reduce((sum, q) => sum + (Number(answers?.[q.key]) || 0), 0);
  const archetype = ARCHETYPES.find((a) => total <= a.max);
  return { key: archetype.key, label: archetype.label, blurb: archetype.blurb, score: total };
}

// The registered insight's compute() -- input is the raw answers map
// ({ window: 2, riskInDraft: 1, ... }). Persists the whole scored result,
// not just the raw answers, so every future reader (a badge, a share
// card, the eventual roster-reconciliation insight) reads one small JSON
// value instead of re-deriving it.
export async function computeGmArchetype(answers) {
  return scoreGmArchetype(answers || {});
}

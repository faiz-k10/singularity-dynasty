// Who is ahead on the scoreboard: "lead" for the higher score, "trail" for the lower, null for a tie or an unknown
// score (0.0 - 0.0 before kickoff is a tie, so nothing is coloured). Used by the Sunday board cards and the matchup
// scoreboard (green = leading, red = trailing).
export function leadState(mine, theirs) {
  if (typeof mine !== "number" || typeof theirs !== "number" || mine === theirs) return [null, null];
  return mine > theirs ? ["lead", "trail"] : ["trail", "lead"];
}

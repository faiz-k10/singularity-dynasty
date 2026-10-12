// A team on a bye is published with the opponent "NA" (no game that week). One place decides what that means so
// every surface that shows a matchup says "BYE WEEK" instead of a team called NA.
export const BYE_LABEL = "BYE WEEK";
export function isBye(opponent) {
  return typeof opponent === "string" && opponent.trim().toUpperCase() === "NA";
}

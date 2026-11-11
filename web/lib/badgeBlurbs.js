// One plain-English phrase per badge, shown on hover (founder, Nov 10 2026: "very brief, vague as to not expose the mechanism, easy for
// someone who knows football"). Keyed by the achievement's key (lib: app/tools/achievements.js); confidence and matchup by variant.
export const BADGE_BLURBS = {
  gold: "A long track record, so his numbers stand on solid ground.",
  silver: "A short track record so far; his picture is still filling in.",
  rookie: "In his first NFL season.",
  onFire: "Has been blowing past expectations lately.",
  onIce: "Has been coming up short lately.",
  volatile: "Boom or bust: big upside, real downside.",
  locked: "Rarely surprises: a tight range of outcomes.",
  solidFloor: "A safer weekly floor than most at his position.",
  highCeiling: "A rare ceiling: the kind of player who wins you a week.",
  buyLow: "His recent box scores undersell how he's being used.",
  sellHigh: "His recent box scores flatter how he's being used.",
  smash: "Faces a defense that's been friendly to his position.",
  tough: "Faces a defense that's been stingy against his position.",
  honorable: "Making the most of the chances he gets.",
  conArtist: "Getting chances but not cashing them in.",
  eliteRole: "One of the most featured players at his position.",
  elitePlayer: "One of the most productive players at his position.",
  plusValue: "A better player than his role suggests.",
  minusValue: "His role is carrying his value.",
  hero: "A star for every top-3 week at his position this season.",
};

// the hover text for one achievement from getAchievements(): just the phrase (the badge's name shows when it is clicked)
export function badgeTitle(a) {
  const blurb = BADGE_BLURBS[a.key === "confidence" || a.key === "matchup" ? a.variant : a.key];
  return blurb || a.label;
}

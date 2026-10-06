// Player archetypes (role groups for RB/WR/TE) as the site displays them. The groups, and which
// player lands where, come from model/player_archetypes.R (table `player_archetypes`); this file
// only holds the wording shown next to a group. The numbers in each blurb are the group's average
// profile from the frozen fit in model/archetype_model.R -- if that model is ever refit, re-check them.

// Below this confidence a player sits on the boundary with his runner-up group, so the panel says so
// instead of presenting the label as clear-cut.
export const ARCHETYPE_NEAR_CONFIDENCE = 0.15;

export const ARCHETYPE_BLURB = {
  // RB
  "Dual-Threat Workhorse": "An every-down back who does it all: about 16 carries and 5-6 targets a game.",
  "Lead Back": "The primary rusher: about 14 carries and 3 targets a game, with a modest receiving share.",
  "Rotational Rusher": "Shares the backfield: about 7 carries and 1 target a game, mostly early-down rushing.",
  "Receiving Back": "A pass-catching specialist: few carries, with about half his yards coming through the air.",
  // WR
  "Target Alpha": "The offense's top target: about 8 targets a game and over a quarter of his team's targets.",
  "Outside Starter": "A starting perimeter receiver: about 5 targets a game, working downfield.",
  "Slot / YAC Receiver": "A short-area receiver: shorter routes, with over half his yards coming after the catch.",
  "Deep-Threat Depth": "A low-volume downfield option: about 3 targets a game, each travelling far.",
  // QB
  "Dual-Threat QB": "A mobile quarterback who adds real rushing production: about 6 carries and 35 rushing yards a game.",
  "Downfield Passer": "A pocket passer who attacks downfield: about 8.6 air yards per attempt, with little rushing.",
  "Balanced Starter": "A pass-first starter with some mobility: about 32 attempts and 4 carries a game.",
  "Pocket Distributor": "A high-volume passer working short to intermediate: about 33 attempts a game, rarely running.",
  // TE
  "Featured Receiving TE": "A focal part of the passing game: about 6 targets a game and a fifth of his team's targets.",
  "Balanced TE": "A mid-volume tight end: about 4 targets a game, used downfield more than most.",
  "Low-Volume TE": "A low-volume tight end: about 3 targets a game, mostly short work after the catch.",
};

// Short forms for the small pill under a comparison card's match % (that column is only ~52px wide).
// The full name is the pill's hover title.
export const ARCHETYPE_SHORT = {
  "Dual-Threat Workhorse": "Dual-Threat",
  "Lead Back": "Lead Back",
  "Rotational Rusher": "Rotational",
  "Receiving Back": "Receiving",
  "Target Alpha": "Target Alpha",
  "Outside Starter": "Outside",
  "Slot / YAC Receiver": "Slot / YAC",
  "Deep-Threat Depth": "Deep Threat",
  "Featured Receiving TE": "Featured TE",
  "Balanced TE": "Balanced TE",
  "Low-Volume TE": "Low-Volume",
  "Dual-Threat QB": "Dual-Threat",
  "Downfield Passer": "Downfield",
  "Balanced Starter": "Balanced",
  "Pocket Distributor": "Pocket",
};

// Colour family of each tag (a CSS class, see .tone-* in globals.css). Role pills have no entry and use the default.
export const TAG_TONE = {
  "Running Hot": "hot",
  "Running Cold": "cold",
  "In Line": "neutral",
  Ascending: "up",
  Prime: "prime",
  "Decline Watch": "warn",
  "Late Career": "late",
  Veteran: "neutral",
};

// The three kinds of tag a player can carry, in display order, with the small heading shown over the
// caption when that kind is selected.
export const TAG_KINDS = [
  { key: "role", heading: "Player role" },
  { key: "sus", heading: "Sustainability" },
  { key: "stage", heading: "Career stage" },
];

// Plain-language age ranges behind each career stage, per position. These mirror STAGE_CUTS in
// model/player_groups.R (from the README's longitudinal age curves) -- change both together.
export const STAGE_TEXT = {
  RB: { Ascending: "still in the growth years for RBs (through age 23)", Prime: "prime years for RBs (ages 24-26)", "Decline Watch": "RBs typically begin to decline around here (ages 27-28)", "Late Career": "RBs typically fall off sharply from age 29" },
  WR: { Ascending: "still in the growth years for WRs (through age 24)", Prime: "prime years for WRs (ages 25-27)", "Decline Watch": "WRs typically begin to decline around here (ages 28-29)", "Late Career": "WRs typically fall off sharply from age 30" },
  TE: { Ascending: "still in the growth years for TEs (through age 25)", Prime: "prime years for TEs (ages 26-29)", "Decline Watch": "TEs age slowly, but decline begins around here (ages 30-31)", "Late Career": "late career for a TE (age 32 and up)" },
  QB: { Ascending: "a young QB (through age 24)", Prime: "QBs hold their value well through the mid-30s (ages 25-35)", Veteran: "veteran QB territory (age 36 and up)" },
};

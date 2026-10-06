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
};

// The landing page's words below the hero (founder, Nov 16 2026: summary -> plans -> who it's for + the tools -> a week with the
// site -> FAQ + testimonials). Plain words, never the method ("10,000 simulations" etc. stay off this page).

// Page 2: the whole site on one page. [name, what it does, when you'd use it, link]
export const SUMMARY = [
  ["The Game Board", "Every league you play, live, on one screen, with a heads-up when a starter needs attention.", "Game day", "/my-team"],
  ["Weekly Projection Rankings", "Every player's bad, normal and great week, and the matchups that tilt it.", "Tuesdays", "/tools/redraft-rankings"],
  ["Dynasty Board", "Production against age, tiered by who is truly a step ahead.", "All year", "/tools/draft-board"],
  ["Player Season Simulations", "Where each player's season is heading, and how it has moved week to week.", "Weekly", "/tools/player-simulations"],
  ["The Observatory", "Any two numbers, every player, one chart you can share.", "Anytime", "/tools/lab"],
  ["Best Available", "The free agent in each league who beats your weakest starter.", "Waiver day", "/my-team"],
  ["The Night Sky", "A game for members: stars for checking in, finds to collect, a sky to fill.", "Daily", "/account/sky"],
  ["The Tuesday letter", "What moved, before waivers, written for the kind of manager you are.", "Tuesdays", "/newsletter"],
];

// Page 4: who it's for.
export const FOR_YOU = [
  ["You play in more than one league.", "Three, five, ten dynasty and redraft leagues on Sleeper, and no time to check each one by hand."],
  ["You'd rather see the numbers.", "Not a gut-feel ranking or a hot take: every player's range, and how often that range has been right."],
  ["You play for years, not weeks.", "You care who is rising, who is fading and who has good seasons left, not just who scores on Sunday."],
];

// Page 4: what each tool adds, in two plain lines. Keyed by section.
export const WHY = {
  board: ["Every score, win chance and lineup problem across all your leagues, spotted before you'd have found it yourself.", "Sunday turns into one radar screen: every league live, and the plays that swing your matchups the second they happen."],
  weekly: ["A floor, a likely landing and a ceiling for every player, so every close start / sit has an answer you can see.", "Smash Spots, Tough Spots, On Fire streaks and Super Heroes: the whole week's storylines at a glance."],
  dynasty: ["One score that weighs what a player produces against how many good years he has left, grouped into tiers so you can see who is a true step above the rest.", "Startup and rookie drafts stop being a shouting match: you see the rising stars and the fading ones before your league does."],
  sims: ["Each player's whole season as a range that updates after every game, with who he is tracking like.", "Breakouts and collapses get spotted early, so you are the first in your league to see them coming."],
  lab: ["Every number on the site on one chart: any position, any two stats, with the trend line and how strong it is.", "Settle the group chat with one chart. Export it in a click and post it."],
  sky: ["Nothing to learn: check in on the tools you already use and the stars add up on their own.", "Collect finds, light constellations and win real rewards, with a brand-new sky every season."],
};

// Page 5: a week with the site, in order. [day, time, what happens, tool, link]
export const WEEK = [
  ["Tuesday", "Afternoon", "New projections land. See who moved and why before your league reacts, and the Tuesday letter is in your inbox.", "Weekly Projection Rankings", "/tools/redraft-rankings"],
  ["Wednesday", "Waiver day", "Open each league's Best Available: the free agent who beats your weakest starter, ranked by this week's projection.", "Best Available", "/my-team"],
  ["Thursday", "Before kickoff", "Lineup alerts flag every injured, ruled-out or bye-week starter in every league, with the bench player to swap in.", "Lineup Alerts", "/my-team"],
  ["Friday – Saturday", "Research", "Look up the players you're unsure about: their season range, their role, and any two numbers side by side.", "Season Sims · The Observatory", "/tools/player-simulations"],
  ["Sunday", "Game day", "Every league live on one screen: scores, win chances, who's on the field and the plays that matter, as they happen.", "The Game Board", "/my-team"],
  ["Monday", "Wrap-up", "The Game Companion explains what decided each matchup. Collect your stars for the week in the Night Sky.", "Game Companion · Night Sky", "/my-team"],
  ["Offseason", "Draft season", "Tiers for startup and rookie drafts, built on production and age, so you know who is really a step ahead.", "Dynasty Board", "/tools/draft-board"],
];

// Page 6: members' words. Empty until real ones arrive -- the section then shows a "coming soon" note. NEVER put an invented quote
// here: { quote, name, detail } only from a real member who agreed to be quoted.
export const TESTIMONIALS = [];

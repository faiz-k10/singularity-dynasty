// The landing page's words below the hero (founder, Nov 16 2026: summary -> plans -> who it's for + the tools -> a week with the
// site -> FAQ + testimonials). Plain words, never the method ("10,000 simulations" etc. stay off this page).

// Page 2: the whole site on one page. [name, what it does, when you'd use it, link]
export const SUMMARY = [
  ["The Game Board", "Every league live on one screen.", "Game day", "/my-team"],
  ["Weekly Projection Rankings", "Where does your favorite player rank? Which badges did he earn?", "Tuesdays", "/tools/redraft-rankings"],
  ["Dynasty Board", "For all contenders and rebuilders, and that includes you.", "All year", "/tools/draft-board"],
  ["Player Season Simulations", "Every player's season prediction, either at his worst or at his best.", "Weekly", "/tools/player-simulations"],
  ["The Observatory", "Stats, players, charts. The football universe is yours.", "Anytime", "/tools/lab"],
  ["Compare Players", "Compare up to four players side by side. Every number lined up, the edge marked.", "Start / sit", "/tools/compare-players"],
  ["The Night Sky", "Members only. Explore the galaxy, find your stars, fill your sky.", "Daily", "/account/sky"],
  ["The Singularity Drive", "Reach for the next level with The Singularity Drive Newsletter.", "Tuesdays", "/newsletter"],
];

// Page 4: what each tool adds, in two plain lines. Keyed by section.
export const WHY = {
  board: ["Every score, win chance and lineup problem across all your leagues, spotted before you'd have found it yourself.", "Sunday becomes one radar screen. Every league live, every swing play as it lands."],
  weekly: ["A floor, a likely landing and a ceiling for every player, so every close start / sit has an answer you can see.", "Smash Spots, Tough Spots, On Fire streaks, Super Heroes. The week's storylines in one glance."],
  dynasty: ["One score that weighs what a player produces against how many good years he has left, grouped into tiers so you can see who is a true step above the rest.", "Startup and rookie drafts, tiered. See the rising stars and the fading ones before your league does."],
  sims: ["Each player's whole season as a range that updates after every game, with who he is tracking like.", "Breakouts and collapses, flagged early. You see them first."],
  lab: ["Every number on the site on one chart: any position, any two stats, with the trend line and how strong it is.", "Settle the group chat with one chart. Export, post, done."],
  sky: ["Nothing to learn: check in on the tools you already use and the stars add up on their own.", "Collect finds, light constellations, earn real rewards. A new sky every season."],
};

// Page 5: a week with the site, in order. [day, time, what happens, tool, link]
export const WEEK = [
  ["Tuesday", "Afternoon", "Projections drop. See who moved before your league notices. The Singularity Drive Newsletter lands too.", "Weekly Projection Rankings", "/tools/redraft-rankings"],
  ["Wednesday", "Waiver day", "Best Available, league by league. The free agent who beats your weakest starter, ranked.", "Best Available", "/my-team"],
  ["Thursday", "Before kickoff", "Lineup Alerts sweep every league. Injured, out or on bye: flagged, with the bench swap.", "Lineup Alerts", "/my-team"],
  ["Friday – Saturday", "Research", "Run down your doubts. Season range, role, any two stats side by side.", "Season Sims · The Observatory", "/tools/player-simulations"],
  ["Sunday", "Game day", "Every league on one screen. Scores, odds, players on the field, plays as they land.", "The Game Board", "/my-team"],
  ["Monday", "Wrap-up", "The Game Companion names what decided each matchup. The week's stars go in the Night Sky.", "Game Companion · Night Sky", "/my-team"],
  ["Offseason", "Draft season\nComing soon", "Startup and rookie tiers. Production against age shows who is really ahead.", "Dynasty Board", "/tools/draft-board"],
];

// Page 6: members' words. Empty until real ones arrive -- the section then shows a "coming soon" note. NEVER put an invented quote
// here: { quote, name, detail } only from a real member who agreed to be quoted.
export const TESTIMONIALS = [];

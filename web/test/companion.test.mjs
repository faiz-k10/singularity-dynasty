import test from "node:test";
import assert from "node:assert/strict";
import { buildInsights, weekPhase } from "../lib/companion.js";

const P = (id, name, pos, team, proj, floor, ceiling, extra = {}) => ({ id, name, pos, team, proj, floor, ceiling, slot: pos, pts: 0, ...extra });
const league = (id, mine, opp, extra = {}) => ({
  id,
  league_name: `League ${id}`,
  settings: { week: 7, opponent: "Rival", winChance: 0.5, h2h: { mine, opp }, ...extra },
});

test("preview: swing player is the widest-range player still to play in the closest league", () => {
  const t = league("a", [P("1", "Steady", "RB", "SF", 12, 8, 17), P("2", "Boom", "WR", "DAL", 14, 3, 31)], [P("9", "Foe", "QB", "KC", 20, 12, 30)], { winChance: 0.52 });
  const gs = { SF: { state: "pre" }, DAL: { state: "pre" }, KC: { state: "pre" } };
  const { phase, cards } = buildInsights({ savedTeams: [t], gameStates: gs });
  assert.equal(phase, "preview");
  const swing = cards.find((c) => c.kind === "swing");
  assert.equal(swing.player.name, "Boom");
  assert.match(swing.body, /3\.0–31\.0/);
});

test("lineup holes lead the list", () => {
  const t = league("a", [P("", "", "WR", null, 0, 0, 0, { id: "" }), P("2", "Hurt", "RB", "SF", 0, 0, 0, { out: true })], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const { cards } = buildInsights({ savedTeams: [t], gameStates: { SF: { state: "pre" }, KC: { state: "pre" } } });
  assert.equal(cards[0].kind, "alert");
  assert.ok(cards.some((c) => /isn't active/.test(c.title)));
});

test("recap: star, letdown, and the player who flipped the result", () => {
  const t = league("a", [P("1", "Star", "RB", "SF", 10, 5, 20, { pts: 24 }), P("2", "Dud", "WR", "DAL", 12, 6, 22, { pts: 4 })], [P("9", "Foe", "QB", "KC", 20, 12, 30, { pts: 25 })], {
    matchupActual: { mine: 28, opp: 25 },
  });
  const gs = { SF: { state: "post" }, DAL: { state: "post" }, KC: { state: "post" } };
  const { phase, cards } = buildInsights({ savedTeams: [t], gameStates: gs });
  assert.equal(phase, "recap");
  assert.equal(cards.find((c) => c.id === "star").player.name, "Star");
  assert.equal(cards.find((c) => c.id === "dud").player.name, "Dud");
  const flip = cards.find((c) => c.id === "flip:a");
  assert.ok(flip, "Star's +14 flipped a 3-point win");
  assert.match(flip.body, /theirs by/);
});

test("waiver card needs a real gain over the lowest starter at that position", () => {
  const t = league("a", [P("1", "Meh", "WR", "SF", 7, 3, 14)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const gs = { SF: { state: "pre" }, KC: { state: "pre" } };
  const w = { a: [{ name: "Small", pos: "WR", team: "LV", proj: 8, adds: 0 }, { name: "Big", pos: "WR", team: "NYJ", proj: 12, adds: 4000 }] };
  const card = buildInsights({ savedTeams: [t], gameStates: gs, waivers: w }).cards.find((c) => c.kind === "waiver");
  assert.equal(card.player.name, "Big");
  assert.match(card.body, /4k/);
  assert.equal(buildInsights({ savedTeams: [t], gameStates: gs, waivers: { a: [{ name: "Small", pos: "WR", team: "LV", proj: 8, adds: 0 }] } }).cards.some((c) => c.kind === "waiver"), false);
});

test("something to say with no games at all (playoff picture)", () => {
  const t = { id: "a", league_name: "L", settings: { playoffOdds: 0.55, record: "3-3", season: { weeksLeft: 7 } } };
  const { phase, cards } = buildInsights({ savedTeams: [t], gameStates: {} });
  assert.equal(phase, "off");
  assert.equal(cards[0].id, "bubble");
});

test("phase: live beats everything", () => {
  const t = league("a", [P("1", "A", "RB", "SF", 10, 5, 20)], [P("9", "B", "QB", "KC", 20, 12, 30)]);
  assert.equal(weekPhase([t], { SF: { state: "in" }, KC: { state: "post" } }), "live");
  assert.equal(weekPhase([t], { SF: { state: "pre" }, KC: { state: "post" } }), "between");
});

test("every day has a card: Wednesday is waiver day, Tuesday names the moved starters", () => {
  const t = league("a", [P("1", "Meh", "WR", "SF", 7, 3, 14)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const wed = buildInsights({ savedTeams: [t], gameStates: {}, now: new Date(2026, 9, 21, 9), waivers: { a: [{ name: "Big", pos: "WR", team: "NYJ", proj: 12, adds: 0 }] } });
  const c = wed.cards.find((x) => x.id === "today");
  assert.equal(c.title, "Waiver day");
  assert.match(c.body, /Big/);
  const tue = buildInsights({ savedTeams: [t], gameStates: {}, now: new Date(2026, 9, 20, 9), feed: { ready: true, week: 7, prevWeek: 6, all: { starters: 3, items: [] } } });
  assert.match(tue.cards.find((x) => x.id === "today").body, /3 of your starters/);
});

test("game day: counts today's starters and the first kickoff", () => {
  const now = new Date(2026, 9, 25, 9);
  const at = (h) => new Date(2026, 9, 25, h).toISOString();
  const t = league("a", [P("1", "Early", "RB", "SF", 12, 6, 20), P("2", "Late", "WR", "DAL", 11, 4, 22)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const gs = { SF: { state: "pre", start: at(13) }, DAL: { state: "pre", start: at(16) }, KC: { state: "pre", start: at(13) } };
  const c = buildInsights({ savedTeams: [t], gameStates: gs, now }).cards.find((x) => x.id === "today");
  assert.match(c.title, /2 of your starters play today/);
  assert.match(c.body, /opponents' starters is in action/);
});

test("since-last-week cards, injury report and standings", () => {
  const t = { ...league("a", [P("1", "Hurt", "RB", "SF", 12, 6, 20)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]), settings: { ...league("a", [P("1", "Hurt", "RB", "SF", 12, 6, 20)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]).settings, season: { standings: [{ isMe: true, rank: 2, wins: 5, losses: 1, pf: 701 }, { rank: 1 }, { rank: 3 }] } } };
  const feed = { ready: true, prevWeek: 6, all: { items: [{ name: "Mover", position: "WR", starter: true, teams: [{ label: "L" }], lines: [{ dir: "up", text: "Season median +9 pts" }] }] }, byTeam: [] };
  const { cards } = buildInsights({ savedTeams: [t], gameStates: { SF: { state: "pre" }, KC: { state: "pre" } }, feed, injuriesByTeam: { a: [{ name: "Hurt", status: "Doubtful", severity: 2 }] } });
  assert.equal(cards.find((c) => c.id === "change:Mover").tone, "mine");
  assert.match(cards.find((c) => c.id === "injuries").body, /Hurt \(Doubtful\)/);
  assert.match(cards.find((c) => c.id === "standings").title, /2nd of 3/);
});

test("lineup upgrade card names the swap and the gain", () => {
  const P2 = (id, name, pos, team, proj, x = {}) => ({ player_id: id, name, position: pos, team, myProjPts: proj, isStarter: false, slotIndex: 999, ...x });
  const t = {
    id: "a",
    league_name: "L",
    settings: { slots: ["RB", "FLEX"], h2h: { mine: [], opp: [] } },
    players: [P2("1", "Starter", "RB", "SF", 12, { isStarter: true, slotIndex: 0 }), P2("2", "Weak", "WR", "DAL", 4, { isStarter: true, slotIndex: 1 }), P2("3", "Bench", "WR", "KC", 11)],
  };
  const c = buildInsights({ savedTeams: [t], gameStates: { SF: { state: "pre" }, DAL: { state: "pre" }, KC: { state: "pre" } } }).cards.find((x) => x.kind === "lineup");
  assert.match(c.title, /Start Bench over Weak/);
  assert.match(c.body, /7\.0 more/);
});

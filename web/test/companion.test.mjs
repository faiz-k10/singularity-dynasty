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
  assert.match(swing.body, /anywhere from 3\.0 to 31\.0/);
  assert.doesNotMatch(JSON.stringify(cards), /win chance|% to win|expect \d\.\d\d wins/i, "no card talks about win chance");
});

test("lineup holes lead the list", () => {
  const t = league("a", [P("", "", "WR", null, 0, 0, 0, { id: "" }), P("2", "Hurt", "RB", "SF", 0, 0, 0, { out: true })], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const { cards } = buildInsights({ savedTeams: [t], gameStates: { SF: { state: "pre" }, KC: { state: "pre" } } });
  assert.equal(cards[0].kind, "alert");
  assert.ok(cards.some((c) => /Hurt won't play/.test(c.title)));
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
  assert.match(flip.title, /Star won you League a/);
  assert.match(flip.body, /With an ordinary day from him, they'd be ahead by/);
});

test("waiver card needs a real gain over the lowest starter at that position", () => {
  const t = league("a", [P("1", "Meh", "WR", "SF", 7, 3, 14)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const gs = { SF: { state: "pre" }, KC: { state: "pre" } };
  const w = { a: [{ name: "Small", pos: "WR", team: "LV", proj: 8 }, { name: "Big", pos: "WR", team: "NYJ", proj: 12 }] };
  const card = buildInsights({ savedTeams: [t], gameStates: gs, waivers: w }).cards.find((c) => c.kind === "waiver");
  assert.equal(card.player.name, "Big");
  assert.match(card.body, /5\.0 more than Meh/);
  assert.equal(buildInsights({ savedTeams: [t], gameStates: gs, waivers: { a: [{ name: "Small", pos: "WR", team: "LV", proj: 8 }] } }).cards.some((c) => c.kind === "waiver"), false);
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
  const wed = buildInsights({ savedTeams: [t], gameStates: {}, now: new Date(2026, 9, 21, 9), waivers: { a: [{ name: "Big", pos: "WR", team: "NYJ", proj: 12 }] } });
  const c = wed.cards.find((x) => x.id === "today");
  assert.equal(c.title, "Waiver day");
  assert.match(c.body, /Big/);
  const tue = buildInsights({ savedTeams: [t], gameStates: {}, now: new Date(2026, 9, 20, 9), feed: { ready: true, week: 7, prevWeek: 6, all: { starters: 3, items: [] } } });
  assert.match(tue.cards.find((x) => x.id === "today").body, /3 starters of yours moved/);
});

test("game day: counts today's starters and the first kickoff", () => {
  const now = new Date(2026, 9, 25, 9);
  const at = (h) => new Date(2026, 9, 25, h).toISOString();
  const t = league("a", [P("1", "Early", "RB", "SF", 12, 6, 20), P("2", "Late", "WR", "DAL", 11, 4, 22)], [P("9", "Foe", "QB", "KC", 20, 12, 30)]);
  const gs = { SF: { state: "pre", start: at(13) }, DAL: { state: "pre", start: at(16) }, KC: { state: "pre", start: at(13) } };
  const c = buildInsights({ savedTeams: [t], gameStates: gs, now }).cards.find((x) => x.id === "today");
  assert.match(c.title, /2 starters of yours play today/);
  assert.match(c.body, /Your opponents have 1 in action too/);
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
  assert.equal(c.league, "L");
  assert.match(c.body, /Bench to score about 11 and Weak about 4: 7\.0 more points/);
});

test("swing, threat and exposure cards speak in projected points, never win chance", () => {
  const gs = { SF: { state: "pre" }, DAL: { state: "pre" }, KC: { state: "pre" }, BUF: { state: "pre" } };
  const mk = (id, opp) => league(id, [P("1", "Boom", "WR", "DAL", 14, 3, 31), P("2", "Steady", "RB", "SF", 12, 8, 17)], opp);
  const a = mk("a", [P("9", "Foe", "QB", "KC", 40, 30, 50)]);
  const b = mk("b", [P("8", "Other", "TE", "BUF", 9, 4, 16)]);
  const { cards } = buildInsights({ savedTeams: [a, b], gameStates: gs });
  const swing = cards.find((c) => c.kind === "swing");
  assert.match(swing.title, /could swing/);
  assert.match(swing.body, /decided by \d+\.\d points \(/);
  const threat = cards.find((c) => c.kind === "threat");
  assert.match(threat.title, /Watch out for Foe/);
  assert.match(threat.body, /we expect about 40 from him, and you're behind by 14\.0 on paper/);
  assert.match(threat.body, /his bad days look like 30\.0/);
  const exp = cards.find((c) => c.id === "exposure:1");
  assert.match(exp.body, /you get it 2 times over/);
  assert.match(exp.body, /great day he's worth 62 points to you across them; on a bad one, 6/);
  assert.doesNotMatch(JSON.stringify(cards), /win chance|% to win|expect \d\.\d\d wins/i);
});

test("matchup trends, form, range profile and position gaps come from the site's own data", () => {
  const S = (id, name, pos, team, proj, extra = {}) => ({ player_id: id, name, position: pos, team, isStarter: true, myProjPts: proj, achievements: [], ...extra });
  const t = {
    id: "a",
    league_name: "League a",
    settings: {
      week: 7,
      opponent: "Rival",
      h2h: {
        mine: [P("1", "Smasher", "WR", "DAL", 14, 5, 24), P("2", "Toughie", "RB", "SF", 12, 8, 17), P("3", "Wobbly", "TE", "KC", 6, 1, 18)],
        opp: [P("9", "Foe", "QB", "BUF", 20, 12, 30), P("8", "Rb2", "RB", "BUF", 5, 2, 10), P("7", "Wr2", "WR", "BUF", 5, 2, 10)],
      },
    },
    players: [
      S("1", "Smasher", "WR", "DAL", 14, { myLean: { call: "SMASH", effect: 2.4 }, achievements: [{ key: "onFire" }] }),
      S("2", "Toughie", "RB", "SF", 12, { myLean: { call: "AVOID", effect: -2.2 }, achievements: [{ key: "locked" }] }),
      S("3", "Wobbly", "TE", "KC", 6, { achievements: [{ key: "volatile" }, { key: "sellHigh" }] }),
      { ...S("4", "Cheap", "WR", "NYG", 3, { isStarter: false, achievements: [{ key: "buyLow" }] }) },
    ],
  };
  const gs = { SF: { state: "pre" }, DAL: { state: "pre" }, KC: { state: "pre" }, BUF: { state: "pre" }, NYG: { state: "pre" } };
  const { cards } = buildInsights({ savedTeams: [t], gameStates: gs });
  const trend = cards.find((c) => c.id === "matchup-trends");
  assert.match(trend.title, /1 starter of yours has an easy matchup, 1 a tough one/);
  assert.match(trend.body, /Easy: Smasher \(\+2\.4\)/);
  assert.match(trend.body, /Tough: Toughie \(−2\.2\)/);
  const form = cards.find((c) => c.id === "form");
  assert.match(form.title, /Smasher is on fire/);
  const value = cards.find((c) => c.id === "value");
  assert.match(value.body, /Buy Low: Cheap/);
  assert.match(value.body, /Sell High: Wobbly/);
  const range = cards.find((c) => c.id === "range-profile");
  assert.match(range.title, /half steady, half wild/);
  assert.match(range.body, /Wild cards \(big highs, big lows\): Wobbly/);
  assert.match(range.body, /Steady \(rarely surprises\): Toughie/);
  const gaps = cards.find((c) => c.id === "gaps:a");
  assert.match(gaps.title, /you win at (WR|RB|TE), lose at QB/);
  assert.match(gaps.body, /Their quarterback should outscore yours by 20\.0/);
});

test("plain English: no stats jargon in any card", () => {
  const gs = { SF: { state: "pre" }, DAL: { state: "pre" }, KC: { state: "pre" }, BUF: { state: "pre" } };
  const a = league("a", [P("1", "Boom", "WR", "DAL", 14, 3, 31), P("2", "Steady", "RB", "SF", 12, 8, 17)], [P("9", "Foe", "QB", "KC", 40, 30, 50)]);
  const b = league("b", [P("1", "Boom", "WR", "DAL", 14, 3, 31)], [P("8", "Other", "TE", "BUF", 9, 4, 16)]);
  const text = JSON.stringify(buildInsights({ savedTeams: [a, b], gameStates: gs }).cards);
  assert.doesNotMatch(text, /median|projected gap|percentile|on projections|floor \d|ceiling \d/i);
});

test("a negative score reads as below zero, not as a margin", () => {
  const t = league("a", [P("1", "Penix", "QB", "ATL", 15.3, 7, 26, { pts: -1.6 })], [P("9", "Foe", "QB", "KC", 20, 12, 30, { pts: 20 })], { matchupActual: { mine: -1.6, opp: 20 } });
  const dud = buildInsights({ savedTeams: [t], gameStates: { ATL: { state: "post" }, KC: { state: "post" } } }).cards.find((c) => c.id === "dud");
  assert.equal(dud.title, "Penix finished below zero: -1.6");
  assert.match(dud.body, /We expected about 15/);
  assert.match(dud.body, /turnovers/);
});

test("live: comeback watch, nail-biter, points left on the bench, MVP", () => {
  const gs = { SF: { state: "post" }, DAL: { state: "in" }, KC: { state: "post" }, NYG: { state: "post" } };
  const t = league(
    "a",
    [P("1", "Done", "RB", "SF", 10, 5, 20, { pts: 6, slot: "FLEX" }), P("2", "Late", "WR", "DAL", 15, 6, 28, { pts: 2 })],
    [P("9", "Foe", "QB", "KC", 14, 8, 24, { pts: 14 })],
    { matchupActual: { mine: 8, opp: 14 }, h2h: { mine: [], opp: [], mineBench: [P("5", "Benched", "WR", "NYG", 8, 3, 15, { pts: 19, slot: "BN" })] } },
  );
  t.settings.h2h.mine = [P("1", "Done", "RB", "SF", 10, 5, 20, { pts: 6, slot: "FLEX" }), P("2", "Late", "WR", "DAL", 15, 6, 28, { pts: 2 })];
  t.settings.h2h.opp = [P("9", "Foe", "QB", "KC", 14, 8, 24, { pts: 14 })];
  const { cards } = buildInsights({ savedTeams: [t], gameStates: gs });
  const cb = cards.find((c) => c.id === "comeback:a");
  assert.equal(cb.label, "Comeback watch");
  assert.match(cb.title, /Down 6\.0, but help is on the way/);
  assert.match(cb.body, /You still have Late to play, worth about 13 more points/);
  const ouch = cards.find((c) => c.id === "ouch:a");
  assert.match(ouch.title, /19\.0 points sat on your bench/);
  assert.match(ouch.body, /Benched scored 19\.0 .* while Done scored 6\.0 in your FLEX spot/);
});

test("fun cards: stacks, NFL record, luck, trivia, and one always reaches the spotlight", () => {
  const S = (id, name, pos, team, extra = {}) => ({ player_id: id, name, position: pos, team, isStarter: true, achievements: [], ...extra });
  const standings = (me) => [{ isMe: true, ...me }, ...[1, 2, 3, 4, 5].map((i) => ({ rank: i + 1, wins: 3, losses: 3, pf: 600 + i, pa: 500 + i }))];
  const mk = (id, mine, me) => ({
    id,
    league_name: `League ${id}`,
    settings: { week: 7, opponent: "Rival", h2h: { mine, opp: [P("9", "Foe", "RB", "KC", 10, 5, 20)] }, season: { standings: standings(me) } },
    players: [S("q", "Qb", "QB", "BUF", { achievements: [{ key: "hero", wins: 4 }] })],
  });
  const a = mk("a", [P("q", "Qb", "QB", "BUF", 20, 12, 30), P("w", "Wr", "WR", "BUF", 12, 4, 22)], { rank: 1, wins: 5, losses: 1, pf: 700, pa: 900 });
  const b = mk("b", [P("x", "Other", "RB", "SF", 12, 6, 20)], { rank: 2, wins: 4, losses: 2, pf: 580, pa: 400 });
  const gs = { BUF: { state: "pre" }, SF: { state: "pre" }, KC: { state: "pre" } };
  const { cards } = buildInsights({ savedTeams: [a, b], gameStates: gs });
  assert.match(cards.find((c) => c.id === "stack:a").title, /Qb throwing to Wr/);
  assert.match(cards.find((c) => c.id === "nfl-record").title, /You'd be 13-4: a Super Bowl favorite/);
  assert.match(cards.find((c) => c.id === "unlucky:a").title, /Nobody in League a has had more points scored against them/);
  assert.match(cards.find((c) => c.id === "trivia:q").title, /Qb has finished top 3 at QB 4 times/);
  assert.ok(cards.slice(0, 6).some((c) => c.tone === "fun"));
});

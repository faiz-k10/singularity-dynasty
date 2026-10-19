import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStandings, teamStrength, simulatePlayoffOdds } from "../lib/playoffOdds.js";

const T = (id, wins, losses, pf) => ({ id, name: id, wins, losses, ties: 0, pf, pa: 0 });

test("rankStandings: wins then points for; best ball by points", () => {
  const teams = [T("a", 3, 2, 600), T("b", 4, 1, 500), T("c", 3, 2, 650)];
  assert.deepEqual(rankStandings(teams).map((t) => t.id), ["b", "c", "a"]);
  assert.deepEqual(rankStandings(teams, { byPoints: true }).map((t) => [t.id, t.rank]), [["c", 1], ["a", 2], ["b", 3]]);
  assert.equal(rankStandings([{ ...T("x", 3, 2, 1), ties: 1 }, T("y", 3, 3, 9)])[0].id, "x"); // a tie is half a win
});

test("teamStrength blends the lineup with points per game and keeps a minimum spread", () => {
  const lineup = [{ proj: 20, floor: 10, ceiling: 36 }, { proj: 10, floor: 4, ceiling: 22 }];
  const a = teamStrength(lineup, 40, 5);
  assert.equal(a.mean, 35); // half of 30 + half of 40
  assert.equal(a.sd, 12); // two players' spread is under the floor
  assert.equal(teamStrength(lineup, 40, 1).mean, 30); // too few games: lineup only
  assert.deepEqual(teamStrength([], 95, 6), { mean: 95, sd: 19 }); // no lineup (best ball): points per game alone
});

test("simulatePlayoffOdds: a clinched team is 100%, an eliminated one 0%, odds sum to the slots", () => {
  const teams = [T("a", 10, 0, 1500), T("b", 5, 5, 1100), T("c", 5, 5, 1090), T("d", 0, 10, 800)];
  const dist = { a: { mean: 110, sd: 20 }, b: { mean: 100, sd: 20 }, c: { mean: 100, sd: 20 }, d: { mean: 90, sd: 20 } };
  const weeks = [
    { games: [["a", "d"], ["b", "c"]], dist },
    { games: [["a", "c"], ["b", "d"]], dist },
  ];
  const odds = simulatePlayoffOdds({ teams, weeks, playoffTeams: 2, sims: 4000 });
  assert.equal(odds.a.playoffOdds, 1);
  assert.equal(odds.d.playoffOdds, 0);
  assert.ok(Math.abs(odds.b.playoffOdds + odds.c.playoffOdds - 1) < 1e-9);
  assert.ok(odds.b.playoffOdds > 0.3 && odds.b.playoffOdds < 0.7);
  assert.ok(odds.a.avgWins >= 10 && odds.a.avgWins <= 12);
  const sum = Object.values(odds).reduce((x, o) => x + o.playoffOdds, 0);
  assert.ok(Math.abs(sum - 2) < 1e-9);
  assert.deepEqual(simulatePlayoffOdds({ teams, weeks, playoffTeams: 2, sims: 500 }), simulatePlayoffOdds({ teams, weeks, playoffTeams: 2, sims: 500 }));
});

test("simulatePlayoffOdds: no weeks left = the current standings; median game adds wins", () => {
  const teams = [T("a", 6, 4, 1200), T("b", 7, 3, 1100), T("c", 4, 6, 1300)];
  const done = simulatePlayoffOdds({ teams, weeks: [], playoffTeams: 1, sims: 10 });
  assert.equal(done.b.playoffOdds, 1);
  // One week left, a always outscores everyone: without the median game a catches b only on wins tie -> PF decides
  const week = { games: [["a", "c"]], dist: { a: { mean: 200, sd: 0 }, b: { mean: 50, sd: 0 }, c: { mean: 100, sd: 0 } } };
  const plain = simulatePlayoffOdds({ teams, weeks: [week], playoffTeams: 1, sims: 10 });
  assert.equal(plain.a.playoffOdds, 1); // 7 wins each, a has more points
  const median = simulatePlayoffOdds({ teams, weeks: [week], playoffTeams: 1, sims: 10, medianGame: true });
  assert.equal(median.a.avgWins, 8); // head-to-head win + above-median win
});

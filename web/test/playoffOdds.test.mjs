import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStandings, seasonStrengths, simulatePlayoffOdds } from "../lib/playoffOdds.js";

const T = (id, wins, losses, pf) => ({ id, name: id, wins, losses, ties: 0, pf, pa: 0 });

test("rankStandings: wins then points for", () => {
  const teams = [T("a", 3, 2, 600), T("b", 4, 1, 500), T("c", 3, 2, 650)];
  assert.deepEqual(rankStandings(teams).map((t) => t.id), ["b", "c", "a"]);
  assert.equal(rankStandings([{ ...T("x", 3, 2, 1), ties: 1 }, T("y", 3, 3, 9)])[0].id, "x"); // a tie is half a win
});

test("seasonStrengths: pulls early scoring toward the league average, less as games pile up", () => {
  // Two strong, two weak teams after 5 games, a league average of 100.
  const five = { a: [130, 120, 125, 135, 140], b: [120, 110, 115, 125, 130], c: [80, 90, 85, 75, 70], d: [70, 80, 75, 85, 90] };
  const s5 = seasonStrengths(five);
  const ppgA = 130;
  assert.ok(s5.a.mean < ppgA && s5.a.mean > 100); // shrunk, not erased
  assert.ok(s5.c.mean > 80 && s5.c.mean < 100);
  assert.ok(s5.a.tau > 5); // real uncertainty about how good a team is, plus roster drift
  assert.ok(s5.a.sd > 0);
  // Too few games: the typical league shape (20% weekly swing, strengths spread ~11%), everyone near the average.
  const one = seasonStrengths({ a: [150], b: [50] });
  assert.equal(one.a.sd, 20);
  assert.ok(one.a.mean > 100 && one.a.mean < 150);
  assert.ok(one.b.mean < 100 && one.b.mean > 50);
  // No games at all: the league average and the full prior spread.
  const none = seasonStrengths({ a: [], b: [] });
  assert.equal(none.a.mean, 0);
});

test("simulatePlayoffOdds: the strength draw keeps a hopeless-looking team alive and a strong one short of certain", () => {
  const teams = ["a", "b", "c", "d", "e", "f"].map((id) => T(id, 3, 2, 500));
  const dist = { a: { mean: 140, sd: 25 }, b: { mean: 110, sd: 25 }, c: { mean: 100, sd: 25 }, d: { mean: 100, sd: 25 }, e: { mean: 90, sd: 25 }, f: { mean: 60, sd: 25 } };
  const pairs = [[["a", "b"], ["c", "d"], ["e", "f"]], [["a", "c"], ["b", "e"], ["d", "f"]], [["a", "d"], ["b", "f"], ["c", "e"]]];
  const weeks = [...pairs, ...pairs, ...pairs].map((games) => ({ games, dist }));
  const sure = simulatePlayoffOdds({ teams, weeks, playoffTeams: 3, sims: 3000 });
  const tau = Object.fromEntries(Object.keys(dist).map((id) => [id, 15]));
  const humble = simulatePlayoffOdds({ teams, weeks, playoffTeams: 3, tau, sims: 3000 });
  assert.ok(humble.a.playoffOdds < sure.a.playoffOdds);
  assert.ok(humble.f.playoffOdds > sure.f.playoffOdds);
  // A live week ignores the strength draw.
  const liveOnly = simulatePlayoffOdds({ teams, weeks: weeks.slice(0, 1).map((w) => ({ ...w, live: true })), playoffTeams: 3, tau, sims: 500 });
  const noTau = simulatePlayoffOdds({ teams, weeks: weeks.slice(0, 1).map((w) => ({ ...w, live: true })), playoffTeams: 3, sims: 500 });
  assert.deepEqual(Object.values(liveOnly).map((o) => o.playoffOdds).length, 6);
  assert.ok(Math.abs(liveOnly.a.playoffOdds - noTau.a.playoffOdds) < 0.08);
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

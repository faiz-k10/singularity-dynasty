import { test } from "node:test";
import assert from "node:assert/strict";
import { weekRows, displayName, expectedWins } from "../lib/briefing.js";

const team = (name, extra = {}) => ({ id: name, league_name: name, team_name: "jay", settings: { record: "3-4", opponent: "Rival", winChance: 0.5, matchupProj: { mine: 110.2, opp: 104.1 }, ...extra } });

test("rows: live score once anyone has scored, projections before; byes carry no chance", () => {
  const [a, b, c] = weekRows([team("A", { matchupActual: { mine: 12, opp: 0 }, winChance: 0.97 }), team("B"), team("C", { isBye: true })]);
  assert.deepEqual([a.live, a.mine, a.label, a.tone], [true, 12, "Favored", "mint"]);
  assert.deepEqual([b.live, b.mine, b.opp, b.label], [false, 110.2, 104.1, "Toss-up"]);
  assert.equal(c.p, null);
  assert.equal(c.bye, true);
});

test("display name: the team name used most", () => {
  assert.equal(displayName([{ team_name: "jay" }, { team_name: "Golden" }, { team_name: "jay" }]), "jay");
  assert.equal(displayName([]), null);
});

test("expected wins: the sum of the win chances, byes left out", () => {
  const rows = weekRows([team("A", { winChance: 0.9 }), team("B", { winChance: 0.1 }), team("C", { isBye: true })]);
  assert.deepEqual(expectedWins(rows), { wins: 1, of: 2, pct: 50 });
});

test("weekRows with the scoreboard: a finished matchup is Won / Lost at 100% / 0%, not a long shot", () => {
  const post = { SF: { state: "post" }, KC: { state: "post" } };
  const P = (id, team, pts) => ({ id, name: id, pos: "WR", team, proj: 12, floor: 4, ceiling: 22, slot: "WR", pts });
  const lost = { id: "L", league_name: "Lost League", settings: { week: 7, opponent: "R", winChance: 0.004, matchupActual: { mine: 40, opp: 90 }, h2h: { mine: [P("a", "SF", 40)], opp: [P("b", "KC", 90)] } } };
  const [row] = weekRows([lost], post);
  assert.equal(row.label, "Lost");
  assert.equal(row.p, 0);
  assert.equal(row.done, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { weekRows, displayName, greetingFor, weekBriefing, gravityNodes, expectedWins, radiusFor, CORE, EDGE } from "../lib/briefing.js";

const team = (name, extra = {}) => ({ id: name, league_name: name, team_name: "jay", settings: { record: "3-4", opponent: "Rival", winChance: 0.5, matchupProj: { mine: 110.2, opp: 104.1 }, ...extra } });

test("rows: live score once anyone has scored, projections before; byes carry no chance", () => {
  const [a, b, c] = weekRows([team("A", { matchupActual: { mine: 12, opp: 0 }, winChance: 0.97 }), team("B"), team("C", { isBye: true })]);
  assert.deepEqual([a.live, a.mine, a.label, a.tone], [true, 12, "Favored", "mint"]);
  assert.deepEqual([b.live, b.mine, b.opp, b.label], [false, 110.2, 104.1, "Toss-up"]);
  assert.equal(c.p, null);
  assert.equal(c.bye, true);
});

test("name and greeting", () => {
  assert.equal(displayName([{ team_name: "jay" }, { team_name: "Golden" }, { team_name: "jay" }]), "jay");
  assert.equal(displayName([]), null);
  assert.deepEqual([2, 9, 14, 21].map(greetingFor), ["Up late", "Good morning", "Good afternoon", "Good evening"]);
});

test("briefing: favored count, then coin flips, uphill climbs and long shots by name", () => {
  const rows = weekRows([
    team("Degens", { winChance: 0.98 }),
    team("Free Play", { winChance: 0.49 }),
    team("Kingdom", { winChance: 0.004 }),
    team("Goon", { winChance: 0.97 }),
    team("Addiction", { winChance: 0.003 }),
  ]);
  assert.equal(
    weekBriefing(rows),
    "You're favored in 2 of your 5 matchups this week. Free Play is a coin flip, and Kingdom and Addiction will need a small miracle."
  );
  assert.equal(weekBriefing(weekRows([team("A", { winChance: 0.8 }), team("B", { winChance: 0.7 })])), "You're favored in both of your matchups this week. A clean sweep is in reach.");
  assert.match(weekBriefing(weekRows([team("A", { winChance: 0.3 })])), /aren't favored in any.*A is an uphill climb\./);
});

test("gravity map: favored leagues sit near the core, long shots at the edge; the core shows expected wins", () => {
  assert.equal(radiusFor(1), CORE);
  assert.equal(radiusFor(0), EDGE);
  const rows = weekRows([team("A", { winChance: 0.9 }), team("B", { winChance: 0.1 }), team("C", { isBye: true })]);
  const nodes = gravityNodes(rows);
  assert.equal(nodes.length, 2);
  assert.ok(nodes[0].dist < nodes[1].dist);
  assert.deepEqual(nodes.map((n) => n.angle), [0, 180]);
  assert.deepEqual(expectedWins(rows), { wins: 1, of: 2, pct: 50 });
});

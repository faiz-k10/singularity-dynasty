import test from "node:test";
import assert from "node:assert/strict";
import { matchupState } from "../lib/matchupState.js";
import { buildInsights } from "../lib/companion.js";

const P = (id, name, team, proj, floor, ceiling, pts = 0) => ({ id, name, pos: "WR", team, proj, floor, ceiling, slot: "WR", pts });
const settings = (mine, opp, extra = {}) => ({ week: 7, opponent: "Rival", winChance: 0.5, h2h: { mine, opp }, ...extra });
const gs = { SF: { state: "pre" }, KC: { state: "pre" } };

test("matchupState: one place for scores, win chance, done and lock", () => {
  const s = settings([P("1", "A", "SF", 12, 4, 22)], [P("9", "B", "KC", 12, 4, 22)], { winChance: 0.61, matchupActual: { mine: 0, opp: 0 } });
  const ms = matchupState(s, gs);
  assert.equal(ms.pct, 0.61);
  assert.equal(ms.done, false);
  assert.equal(ms.lock, null);
  assert.equal(ms.st.label, "Favored");
});

test("matchupState: best ball has no win chance and no lock; a bye has no win chance", () => {
  assert.equal(matchupState({ bestBall: true, winChance: 0.7, matchupActual: { mine: 100, opp: 90 } }, gs).pct, null);
  assert.equal(matchupState({ isBye: true, winChance: 0.7 }, gs).pct, null);
});

test("the Companion shows the same win chance as the card (the adjusted one, not the saved snapshot)", () => {
  const s = settings([P("1", "A", "SF", 12, 4, 22, 10)], [P("9", "B", "KC", 12, 4, 22, 10)], { winChance: 0.5, matchupActual: { mine: 10, opp: 10 } });
  const live = { SF: { state: "in", period: 3, clock: 300 }, KC: { state: "in", period: 3, clock: 300 } };
  const plain = matchupState(s, live);
  assert.equal(plain.pct, 0.5); // nothing pending: the server's number, untouched
  const t = { id: "t", league_name: "L", settings: s };
  const adjusted = { t: { adj: { ...plain.adj, winChance: 0.8 } } };
  const swing = buildInsights({ savedTeams: [t], gameStates: live, adjusted }).cards.find((c) => c.kind === "swing");
  assert.match(swing.body, /Your win chance is 80% now/);
  const snapshot = buildInsights({ savedTeams: [t], gameStates: live }).cards.find((c) => c.kind === "swing");
  assert.match(snapshot.body, /Your win chance is 50% now/);
});

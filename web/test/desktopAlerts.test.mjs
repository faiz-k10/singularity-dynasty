import { test } from "node:test";
import assert from "node:assert/strict";
import { findAlerts, newAlerts } from "../lib/desktopAlerts.js";

const NOW = Date.parse("2026-10-18T16:00:00Z");
const gs = {
  SF: { state: "pre", start: "2026-10-18T17:00:00Z" },
  KC: { state: "pre", start: "2026-10-18T17:00:00Z" },
  GB: { state: "in", period: 4, clock: 200 },
  DAL: { state: "in", period: 4, clock: 200 },
  JAX: { state: "post" },
};
const team = (id, league, settings, players = []) => ({ id, league_name: league, players, settings: { week: 6, ...settings } });

test("injury alerts: Doubtful/Out starters before kickoff, one per player across leagues", () => {
  const teams = [
    team("a", "League A", {}, [{ name: "George Kittle", team: "SF" }, { name: "Trevor Lawrence", team: "JAX" }]),
    team("b", "League B", {}, [{ name: "George Kittle", team: "SF" }]),
  ];
  const injuries = {
    a: [
      { name: "George Kittle", status: "Out", severity: 3 },
      { name: "Trevor Lawrence", status: "Doubtful", severity: 2 }, // already played: no alert
    ],
    b: [{ name: "George Kittle", status: "Out", severity: 3 }],
  };
  const alerts = findAlerts({ savedTeams: teams, injuriesByTeam: injuries, gameStates: gs, now: NOW });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "w6|injury|George Kittle");
  assert.match(alerts[0].body, /League A, League B/);
  const q = findAlerts({ savedTeams: teams, injuriesByTeam: { a: [{ name: "George Kittle", status: "Questionable", severity: 1 }] }, gameStates: gs, now: NOW });
  assert.equal(q.length, 0); // Questionable alone doesn't alert
});

test("lineup alerts: empty / bye / inactive slots only near kickoff", () => {
  const h2h = {
    mine: [
      { id: "1", slot: "QB", name: "Patrick Mahomes", team: "KC" },
      { id: null, slot: "FLEX" },
      { id: "2", slot: "WR", name: "Bye Guy", team: "MIA" },
      { id: "3", slot: "SUPER_FLEX", name: "Hurt Guy", team: "NYG", out: true },
    ],
    opp: [],
  };
  const teams = [team("a", "League A", { h2h })];
  const near = findAlerts({ savedTeams: teams, gameStates: gs, now: NOW });
  assert.deepEqual(near.map((a) => a.key), ["w6|lineup|a|1", "w6|lineup|a|2", "w6|lineup|a|3"]);
  assert.match(near[2].body, /SUPERFLEX/);
  const early = findAlerts({ savedTeams: teams, gameStates: gs, now: NOW - 6 * 3600 * 1000 });
  assert.equal(early.length, 0);
});

test("swing alerts: crossing 50% only with a 4th-quarter game in the matchup", () => {
  const h2h = { mine: [{ id: "1", team: "GB" }], opp: [{ id: "2", team: "SF" }] };
  const teams = [team("a", "League A", { h2h, winChance: 0.58, opponent: "Rival" })];
  const swing = findAlerts({ savedTeams: teams, gameStates: gs, prevWin: { a: 0.41 }, now: NOW + 2 * 86400000 });
  assert.equal(swing.length, 1);
  assert.equal(swing[0].key, "w6|swing|a|up");
  assert.match(swing[0].body, /41% → 58% vs Rival/);
  assert.equal(findAlerts({ savedTeams: teams, gameStates: gs, prevWin: { a: 0.55 }, now: NOW + 2 * 86400000 }).length, 0);
  const early = { ...gs, GB: { state: "in", period: 2, clock: 100 } };
  assert.equal(findAlerts({ savedTeams: teams, gameStates: early, prevWin: { a: 0.41 }, now: NOW + 2 * 86400000 }).length, 0);
});

test("newAlerts de-duplicates by key and caps the remembered list", () => {
  const a = [{ key: "x" }, { key: "y" }];
  const first = newAlerts(a, []);
  assert.equal(first.fresh.length, 2);
  const again = newAlerts(a, first.seen);
  assert.equal(again.fresh.length, 0);
  assert.equal(newAlerts([{ key: "z" }], ["a", "b", "c"], 2).seen.join(), "c,z");
});

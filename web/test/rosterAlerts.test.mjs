import { test } from "node:test";
import assert from "node:assert/strict";
import { liveRosterNews, lineupChanged, rosterKey } from "../lib/rosterAlerts.js";

const team = (id, players, settings = {}) => ({ id, league_name: `L${id}`, players, settings });
const P = (player_id, name, position, isStarter) => ({ player_id, name, position, isStarter });
const news = {
  items: [{ key: rosterKey("Jordan Love", "QB"), name: "Jordan Love", starts: ["L1"], rosters: ["L1"] }],
  statusByKey: { [rosterKey("Jordan Love", "QB")]: { status: "Out", severity: 3 }, [rosterKey("Mike Evans", "WR")]: { status: "Questionable", severity: 1 } },
  byTeam: { 1: [{ name: "Jordan Love" }, { name: "Mike Evans" }] },
};

test("a benched player stops being an alert", () => {
  const teams = [team(1, [P("1", "Jordan Love", "QB", false), P("2", "Mike Evans", "WR", false), P("3", "Bo Nix", "QB", true)])];
  const out = liveRosterNews(teams, news);
  assert.deepEqual(out.byTeam, {});
  assert.deepEqual(out.items[0].starts, []);
  assert.deepEqual(out.items[0].rosters, ["L1"]);
});

test("a starter with a designation is an alert", () => {
  const teams = [team(1, [P("1", "Jordan Love", "QB", true), P("2", "Mike Evans", "WR", true)])];
  const out = liveRosterNews(teams, news);
  assert.deepEqual(out.byTeam[1].map((a) => a.status), ["Out", "Questionable"]);
});

test("old server result without statusByKey is passed through", () => {
  const old = { items: [], byTeam: { 1: [{ name: "X" }] } };
  assert.equal(liveRosterNews([], old), old);
});

test("lineupChanged spots a swap and ignores missing teams", () => {
  const teams = [team(1, [P("1", "A", "QB", true), P("2", "B", "WR", false)]), team(2, [P("9", "C", "RB", true)])];
  assert.equal(lineupChanged(teams, { 1: ["1"] }), false);
  assert.equal(lineupChanged(teams, { 1: ["2"] }), true);
  assert.equal(lineupChanged(teams, { 2: ["5"] }), true);
  assert.equal(lineupChanged(teams, null), false);
});

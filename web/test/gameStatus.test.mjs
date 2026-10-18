import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScoreboard, livePointsFor, teamCode } from "../lib/gameStatus.js";

const board = {
  events: [
    { competitions: [{ status: { type: { state: "in", shortDetail: "5:45 - 2nd" } }, competitors: [{ team: { abbreviation: "ATL" } }, { team: { abbreviation: "CHI" } }] }] },
    { competitions: [{ status: { type: { state: "pre" } }, competitors: [{ team: { abbreviation: "SF" } }, { team: { abbreviation: "WSH" } }] }] },
    { competitions: [{ status: { type: { state: "post" } }, competitors: [{ team: { abbreviation: "LAR" } }] }] },
  ],
};

test("parseScoreboard maps ESPN codes to Sleeper's", () => {
  const s = parseScoreboard(board);
  assert.equal(s.ATL.state, "in");
  assert.equal(s.WAS.state, "pre");
  assert.equal(s.LA.state, "post");
  assert.equal(teamCode("LAR"), "LA");
});

test("livePointsFor: dash before kickoff, 0 once playing with no points, value otherwise", () => {
  const s = parseScoreboard(board);
  const pts = { 1: 12.4 };
  assert.deepEqual(livePointsFor({ player_id: "1", team: "ATL" }, pts, s), { pts: 12.4, state: "in" });
  assert.deepEqual(livePointsFor({ player_id: "2", team: "CHI" }, pts, s), { pts: 0, state: "in" });
  assert.equal(livePointsFor({ player_id: "1", team: "WAS" }, pts, s).pts, null);
  assert.equal(livePointsFor({ player_id: "1", team: "MIA" }, pts, s).pts, null); // bye: not on the board
  assert.equal(livePointsFor({ player_id: "1", team: "ATL" }, null, s).pts, null);
});

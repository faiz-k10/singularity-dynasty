import { test } from "node:test";
import assert from "node:assert/strict";
import { findRenewals } from "../lib/leagueRenewal.js";

test("a saved league that renewed moves to its new league", () => {
  const m = findRenewals(["100", "200"], [{ league_id: "101", previous_league_id: "100" }, { league_id: "200", previous_league_id: "150" }]);
  assert.equal(m.size, 1);
  assert.equal(m.get("100").league_id, "101");
});

test("a league the member also saved under its new id is left alone", () => {
  const m = findRenewals(["100", "101"], [{ league_id: "101", previous_league_id: "100" }]);
  assert.equal(m.size, 0);
});

test("a skipped season is followed through the chain", () => {
  const anc = (id) => (id === "103" ? ["102", "100"] : []);
  const m = findRenewals(["100"], [{ league_id: "103", previous_league_id: "102" }], anc);
  assert.equal(m.get("100").league_id, "103");
});

test("no previous league, or Sleeper's '0', matches nothing", () => {
  assert.equal(findRenewals(["0", "100"], [{ league_id: "5", previous_league_id: "0" }, { league_id: "6", previous_league_id: null }]).size, 0);
});

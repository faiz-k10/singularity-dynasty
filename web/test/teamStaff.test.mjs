import { test } from "node:test";
import assert from "node:assert/strict";
import { STAFF, coachFor, acquiringGm } from "../lib/teamStaff.js";

test("every team has a coach, a GM and a first-draft year", () => {
  assert.equal(Object.keys(STAFF).length, 32);
  for (const [t, s] of Object.entries(STAFF)) {
    assert.ok(s.hc && s.gm, t);
    assert.equal(typeof s.hcCalls, "boolean", t);
    assert.ok(Number.isInteger(s.gmFirst) && s.gmFirst > 1980 && s.gmFirst <= 2027, t);
  }
});

test("coachFor reads the current team, LAR is the same as LA, unknown is null", () => {
  assert.deepEqual(coachFor("DET"), { hc: "Dan Campbell", calls: false }); // Drew Petzing calls Detroit's plays
  assert.equal(coachFor("KC").calls, true); // Andy Reid
  assert.equal(coachFor("DEN").calls, true); // Sean Payton took it back in Week 5 2026
  assert.equal(Object.values(STAFF).filter((s) => s.hcCalls).length, 17);
  assert.equal(coachFor("LAR").calls, true);
  assert.equal(coachFor("XXX"), null);
});

test("acquiringGm: draftees by the first draft the GM ran", () => {
  assert.equal(acquiringGm({ team: "DET", draftTeam: "DET", draftYear: 2023 }).state, "yes"); // Holmes from 2021
  assert.equal(acquiringGm({ team: "MIA", draftTeam: "MIA", draftYear: 2022 }).state, "no"); // Sullivan from 2026
  assert.equal(acquiringGm({ team: "BUF", draftTeam: "BUF", draftYear: 2017 }).state, "no"); // Beane's first draft was 2018
  assert.equal(acquiringGm({ team: "MIN", draftTeam: "MIN", draftYear: 2026 }).state, "no"); // Teasley came after the 2026 draft
  assert.equal(acquiringGm({ team: "BUF", draftTeam: "", draftYear: 0 }).state, "undrafted");
});

test("acquiringGm: players who moved, by when they joined against when the GM took over", () => {
  const cmc = acquiringGm({ team: "SF", draftTeam: "CAR", draftYear: 2017, acqDate: "2022-10-20", acqHow: "trade" });
  assert.deepEqual(cmc, { state: "yes", how: "trade", gm: "John Lynch", at: "2022-10-20", from: "CAR" });
  assert.equal(acquiringGm({ team: "MIA", draftTeam: "BUF", draftYear: 2020, acqDate: "2025-03-15", acqHow: "joined" }).state, "no"); // before Sullivan
  assert.equal(acquiringGm({ team: "MIA", draftTeam: "BUF", draftYear: 2020, acqDate: "2026-03-15", acqHow: "joined" }).how, "joined");
  assert.equal(acquiringGm({ team: "SF", draftTeam: "CAR", draftYear: 2017, acqDate: "" }).state, "unknown");
});

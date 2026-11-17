import { test } from "node:test";
import assert from "node:assert/strict";
import { STAFF, coachFor, draftGm } from "../lib/teamStaff.js";

test("every team has a coach, a GM and a first-draft year", () => {
  assert.equal(Object.keys(STAFF).length, 32);
  for (const [t, s] of Object.entries(STAFF)) {
    assert.ok(s.hc && s.gm, t);
    assert.equal(typeof s.hcOC, "boolean", t);
    assert.ok(Number.isInteger(s.gmFirst) && s.gmFirst > 1980 && s.gmFirst <= 2027, t);
  }
});

test("coachFor reads the current team, LAR is the same as LA, unknown is null", () => {
  assert.deepEqual(coachFor("DET"), { hc: "Dan Campbell", oc: false });
  assert.equal(coachFor("LAR").oc, true);
  assert.equal(coachFor("XXX"), null);
});

test("draftGm: yes / no / moved / undrafted", () => {
  assert.equal(draftGm({ team: "DET", draftTeam: "DET", draftYear: 2023 }).state, "yes"); // Holmes from 2021
  assert.equal(draftGm({ team: "MIA", draftTeam: "MIA", draftYear: 2022 }).state, "no"); // Sullivan from 2026
  assert.deepEqual(draftGm({ team: "SF", draftTeam: "CAR", draftYear: 2017 }), { state: "moved", from: "CAR" });
  assert.equal(draftGm({ team: "BUF", draftTeam: "", draftYear: 0 }).state, "undrafted");
  assert.equal(draftGm({ team: "BUF", draftTeam: "BUF", draftYear: 2017 }).state, "no"); // Beane's first draft was 2018
  assert.equal(draftGm({ team: "MIN", draftTeam: "MIN", draftYear: 2026 }).state, "no"); // Teasley came after the 2026 draft
});

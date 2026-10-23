import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoxscore, statChips } from "../lib/gameStats.js";

const json = {
  boxscore: {
    players: [
      {
        team: { id: "17" },
        statistics: [
          { name: "passing", labels: ["C/ATT", "YDS", "TD", "INT"], athletes: [{ athlete: { displayName: "Drake Maye" }, stats: ["24/31", "321", "2", "1"] }] },
          { name: "rushing", labels: ["CAR", "YDS", "TD"], athletes: [{ athlete: { displayName: "Drake Maye" }, stats: ["4", "26", "1"] }, { athlete: { displayName: "TreVeyon Henderson" }, stats: ["2", "6", "0"] }] },
          { name: "receiving", labels: ["REC", "YDS", "TD", "LONG", "TGTS"], athletes: [{ athlete: { displayName: "TreVeyon Henderson" }, stats: ["3", "23", "0", "9", "3"] }] },
        ],
      },
    ],
  },
};

test("parseBoxscore: one line per player per team, keyed by normalized name", () => {
  const b = parseBoxscore(json)["17"];
  assert.equal(b.drakemaye.passing["C/ATT"], "24/31");
  assert.equal(b.treveyonhenderson.receiving.REC, "3");
  assert.equal(b.treveyonhenderson.rushing.CAR, "2");
  assert.deepEqual(parseBoxscore({}), {});
});

test("statChips: the numbers that matter for the position, skipping what he has no line for", () => {
  const b = parseBoxscore(json)["17"];
  assert.deepEqual(statChips("RB", b.treveyonhenderson).map((c) => [c.label, c.value]), [["Carries", "2"], ["Rush yds", "6"], ["Rush TD", "0"], ["Rec", "3"], ["Targets", "3"], ["Rec yds", "23"], ["Rec TD", "0"]]);
  assert.equal(statChips("QB", b.drakemaye)[0].value, "24/31");
  assert.deepEqual(statChips("K", b.drakemaye), []);
  assert.deepEqual(statChips("WR", null), []);
});

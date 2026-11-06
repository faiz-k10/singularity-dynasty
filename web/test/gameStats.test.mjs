import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBoxscore, statChips, findLine } from "../lib/gameStats.js";

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

test("findLine: the nickname ESPN uses still finds him (Kenny / Kenneth Gainwell), an ambiguous or unrelated name finds nobody", () => {
  const box = {
    kennygainwell: { rushing: { CAR: "9" } },
    baker: { rushing: { CAR: "1" } },
    mikeevans: { receiving: { REC: "4" } },
    tevans: { receiving: { REC: "1" } },
    mitchevans: { receiving: { REC: "2" } },
    joshjacobs: { rushing: { CAR: "20" } },
  };
  assert.equal(findLine(box, "Kenneth Gainwell").rushing.CAR, "9"); // nickname: same last name, first names start "ke"
  assert.equal(findLine(box, "Joshua Jacobs").rushing.CAR, "20");
  assert.equal(findLine(box, "Josh Jacobs").rushing.CAR, "20"); // exact
  assert.equal(findLine(box, "Mike Evans").receiving.REC, "4"); // exact wins even though another Evans exists
  assert.equal(findLine(box, "Michael Evans"), null); // Mike and Mitch Evans both start "mi": two candidates, no guess
  assert.equal(findLine(box, "Terry Evans").receiving.REC, "1"); // the one Evans whose first name starts "te"
  assert.equal(findLine(box, "Jaylen Gainwell"), null); // wrong first name
  assert.equal(findLine(null, "Kenneth Gainwell"), null);
});

test("findLine: first names ESPN swaps for an unrelated nickname, and accents", () => {
  const box = { drewogletree: { receiving: { REC: "2" } }, hollywoodbrown: { receiving: { REC: "4" } }, ajbrown: { receiving: { REC: "6" } }, audricestime: { rushing: { CAR: "9" } } };
  assert.equal(findLine(box, "Andrew Ogletree").receiving.REC, "2");
  assert.equal(findLine(box, "Marquise Brown").receiving.REC, "4");
  assert.equal(findLine(box, "Audric Estimé").rushing.CAR, "9");
});

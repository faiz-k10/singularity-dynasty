import { test } from "node:test";
import assert from "node:assert/strict";
import { normName, parseRoster, matchAthlete, parsePlays, playYards, roleLabel, defenseLabel, yardsFor, playPoints, buildPlayFeed } from "../lib/playByPlay.js";

const ath = (id) => ({ athlete: { $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en` } });
const team = (id) => ({ $ref: `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/${id}?lang=en` });
const raw = (id, seq, type, text, people, extra = {}) => ({
  id,
  sequenceNumber: String(seq),
  type: { text: type },
  text,
  period: { number: 4 },
  clock: { displayValue: "3:01" },
  wallclock: `2026-10-19T03:${String(seq).padStart(2, "0")}:00Z`,
  scoringPlay: /Touchdown|Field Goal Good/.test(type),
  team: team(6),
  start: { team: team(6) },
  statYardage: -19,
  participants: people.map(([aid, role]) => ({ ...ath(aid), type: role })),
  ...extra,
});

test("normName ignores suffixes and punctuation", () => {
  assert.equal(normName("Marvin Harrison Jr."), "marvinharrison");
  assert.equal(normName("A.J. Brown"), "ajbrown");
  assert.equal(normName("Kenneth Walker III"), "kennethwalker");
});

test("matchAthlete: full name first, then a unique last name at the position", () => {
  const roster = parseRoster({
    athletes: [
      { items: [
        { id: "1", fullName: "Marquise Brown", position: { abbreviation: "WR" } },
        { id: "2", fullName: "Javonte Williams", position: { abbreviation: "RB" } },
        { id: "3", fullName: "Jalen Williams", position: { abbreviation: "G" } },
        { id: "4", fullName: "Brandon Aubrey", position: { abbreviation: "PK" } },
      ] },
    ],
  });
  assert.equal(matchAthlete({ name: "Javonte Williams", pos: "RB" }, roster), "2");
  assert.equal(matchAthlete({ name: "Hollywood Brown", pos: "WR" }, roster), "1");
  assert.equal(matchAthlete({ name: "Brandon Aubrey", pos: "K" }, roster), "4");
  assert.equal(matchAthlete({ name: "Nobody Here", pos: "WR" }, roster), null);
});

test("playYards reads the play's own yards, not penalty-adjusted statYardage", () => {
  assert.equal(playYards("D.Prescott pass short left to R.Flournoy to GB 12 for 11 yards (C.Valentine).PENALTY on DAL-T.Booker, 15 yards", -19), 11);
  assert.equal(playYards("J.Williams up the middle for no gain", 0), 0);
  assert.equal(playYards("J.Love sacked at GB 4 for -10 yards", -10), -10);
  assert.equal(playYards("T.Smack 44 yard field goal is GOOD", 44), 44);
});

test("roleLabel keeps only plays that move fantasy points", () => {
  assert.equal(roleLabel("Pass Reception", ["receiver", "tackler"]), "Catch");
  assert.equal(roleLabel("Pass Reception", ["passer"]), "Completion");
  assert.equal(roleLabel("Passing Touchdown", ["receiver", "scorer"]), "Touchdown catch");
  assert.equal(roleLabel("Passing Touchdown", ["passer"]), "Touchdown pass");
  assert.equal(roleLabel("Rushing Touchdown", ["rusher", "scorer"]), "Touchdown run");
  assert.equal(roleLabel("Rush", ["rusher"]), "Run");
  assert.equal(roleLabel("Pass Interception Return", ["passer"]), "Interception thrown");
  assert.equal(roleLabel("Fumble Recovery (Opponent)", ["receiver", "fumbler"]), "Fumble lost");
  assert.equal(roleLabel("Field Goal Good", ["kicker", "scorer"]), "Field goal");
  assert.equal(roleLabel("Field Goal Missed", ["kicker"]), "Missed field goal");
  assert.equal(roleLabel("Passing Touchdown", ["kicker", "patScorer"], "(T.Smack kick is good)"), "Extra point");
  assert.equal(roleLabel("Rushing Touchdown", ["kicker"], "(B.Aubrey kick is No Good)"), "Missed extra point");
  // A two-point try's target: counted only when it succeeds (ESPN calls him patScorer either way).
  assert.equal(roleLabel("Passing Touchdown", ["patScorer"], "TWO-POINT CONVERSION ATTEMPT. D.Prescott pass to C.Lamb is incomplete. ATTEMPT FAILS"), null);
  assert.equal(roleLabel("Passing Touchdown", ["patScorer"], "TWO-POINT CONVERSION ATTEMPT. D.Prescott pass to C.Lamb is complete. ATTEMPT SUCCEEDS"), "Two-point conversion");
  // Left off: incompletions, sacks taken, recovered fumbles, penalties, kickoffs.
  assert.equal(roleLabel("Pass Incompletion", ["receiver"]), null);
  assert.equal(roleLabel("Pass Incompletion", ["passer"]), null);
  assert.equal(roleLabel("Sack", ["passer"]), null);
  assert.equal(roleLabel("Fumble Recovery (Own)", ["fumbler"]), null);
  assert.equal(roleLabel("Penalty", ["receiver"]), null);
  assert.equal(roleLabel("Kickoff", ["kicker"]), null);
});

test("defenseLabel and yardsFor", () => {
  assert.equal(defenseLabel("Sack"), "Sack");
  assert.equal(defenseLabel("Interception Return Touchdown"), "Interception touchdown");
  assert.equal(defenseLabel("Fumble Recovery (Opponent)"), "Fumble recovery");
  assert.equal(defenseLabel("Rush"), null);
  assert.equal(yardsFor("Catch", 21), "21 yds");
  assert.equal(yardsFor("Touchdown run", 1), "1 yd");
  assert.equal(yardsFor("Run", 0), "no gain");
  assert.equal(yardsFor("Run", -3), "−3 yds");
  assert.equal(yardsFor("Interception thrown", 0), null);
  assert.equal(yardsFor("Sack", -7), null);
});

test("buildPlayFeed: one entry per player per play, newest first, passer before receiver, sides kept", () => {
  const codeById = { 6: "DAL", 9: "GB" };
  const plays = parsePlays(
    [
      raw("p1", 1, "Rush", "J.Williams right tackle for 20 yards", [["200", "rusher"], ["900", "tackler"]]),
      raw("p2", 2, "Pass Reception", "D.Prescott pass short right to C.Lamb for 24 yards", [["100", "passer"], ["300", "receiver"]]),
      raw("p3", 3, "Pass Incompletion", "D.Prescott pass incomplete to C.Lamb", [["100", "passer"], ["300", "receiver"]]),
      raw("p4", 4, "Passing Touchdown", "J.Love pass to M.Golden for 9 yards, TOUCHDOWN", [["500", "passer"], ["600", "receiver"], ["600", "scorer"]], { team: team(9), start: { team: team(9) } }),
      raw("p6", 6, "Rush", "J.Williams left guard for 19 yards", [["200", "rusher"]]),
      raw("p5", 5, "Sack", "D.Prescott sacked at GB 16 for -3 yards", [["100", "passer"], ["901", "sackedBy"]]),
    ],
    codeById,
  ).map((p) => ({ ...p, teams: ["DAL", "GB"] }));
  const players = [
    { playerId: "a", name: "Javonte Williams", pos: "RB", team: "DAL", side: "theirs", espnId: "200" },
    { playerId: "b", name: "CeeDee Lamb", pos: "WR", team: "DAL", side: "theirs", espnId: "300" },
    { playerId: "c", name: "Jordan Love", pos: "QB", team: "GB", side: "mine", espnId: "500" },
    { playerId: "d", name: "Matthew Golden", pos: "WR", team: "GB", side: "mine", espnId: "600" },
    { playerId: "GB", name: "Green Bay Packers", pos: "DEF", team: "GB", side: "mine" },
  ];
  const feed = buildPlayFeed(players, plays);
  // Every play that moves a fantasy score, newest first, one entry per player: the 19-yard run, the sack (it scores for the GB
  // defense on the board), the touchdown pass as TWO entries (passer, then receiver), the 24-yard catch (only Lamb is on the
  // board, so only his entry) and the 20-yard run. The incompletion moves nobody's points and is left off.
  assert.deepEqual(feed.map((e) => e.id), ["p6:a", "p5:GB", "p4:c", "p4:d", "p2:b", "p1:a"]);
  assert.equal(feed[1].label, "Sack");
  assert.equal(feed[1].side, "mine");
  const [, , tdPass, tdCatch, catchPlay, run] = feed;
  assert.deepEqual(tdPass.who.map((w) => w.name), ["Jordan Love"]);
  assert.equal(tdPass.label, "Touchdown pass");
  assert.equal(tdPass.td, true);
  assert.equal(tdPass.points, 4.4); // 4 + 9 yards x 0.04
  assert.deepEqual(tdCatch.who.map((w) => w.name), ["Matthew Golden"]);
  assert.equal(tdCatch.label, "Touchdown catch");
  assert.equal(tdCatch.td, true);
  assert.equal(tdCatch.points, 7.9); // 6 + 1 for the catch + 9 yards x 0.1
  assert.equal(catchPlay.label, "Catch");
  assert.equal(catchPlay.yards, "24 yds");
  assert.equal(catchPlay.big, true); // 24 yards
  assert.equal(run.big, true); // 20 yards
  assert.equal(feed[0].big, false); // the 19-yard run
  assert.equal(catchPlay.points, 3.4); // 1 per catch + 24 yards x 0.1
  assert.equal(catchPlay.side, "theirs");
  assert.equal(run.when, "3:01 - 4th");
});

test("buildPlayFeed: a player who is yours in one league and theirs in another is one line, side both", () => {
  const plays = parsePlays([raw("p1", 1, "Rush", "J.Williams for 25 yards", [["200", "rusher"]])], { 6: "DAL" }).map((p) => ({ ...p, teams: ["DAL", "GB"] }));
  const feed = buildPlayFeed(
    [
      { playerId: "a", name: "Javonte Williams", pos: "RB", team: "DAL", side: "mine", espnId: "200" },
      { playerId: "a", name: "Javonte Williams", pos: "RB", team: "DAL", side: "theirs", espnId: "200" },
    ],
    plays,
  );
  assert.equal(feed.length, 1);
  assert.equal(feed[0].who.length, 1);
  assert.equal(feed[0].side, "both");
});

test("buildPlayFeed: the kicker's extra point is its own entry, after the passer and the receiver", () => {
  const plays = parsePlays(
    [raw("p1", 1, "Passing Touchdown", "J.Love pass to M.Golden for 9 yards, TOUCHDOWN. T.Smack extra point is GOOD", [["500", "passer"], ["600", "receiver"], ["600", "scorer"], ["700", "kicker"], ["700", "patScorer"]])],
    { 9: "GB" },
  ).map((p) => ({ ...p, teams: ["DAL", "GB"] }));
  const feed = buildPlayFeed(
    [
      { playerId: "k", name: "Trey Smack", pos: "K", team: "GB", side: "mine", espnId: "700" },
      { playerId: "c", name: "Jordan Love", pos: "QB", team: "GB", side: "mine", espnId: "500" },
      { playerId: "d", name: "Matthew Golden", pos: "WR", team: "GB", side: "mine", espnId: "600" },
    ],
    plays,
  );
  assert.deepEqual(feed.map((e) => [e.who[0].name, e.label, e.points]), [
    ["Jordan Love", "Touchdown pass", 4.4],
    ["Matthew Golden", "Touchdown catch", 7.9],
    ["Trey Smack", "Extra point", 1],
  ]);
});

test("playPoints: standard PPR rates", () => {
  assert.equal(playPoints("Catch", 6), 1.6);
  assert.equal(playPoints("Run", 8), 0.8);
  assert.equal(playPoints("Touchdown run", 1), 6.1);
  assert.equal(playPoints("Completion", 25), 1);
  assert.equal(playPoints("Interception thrown", 0), -2);
  assert.equal(playPoints("Field goal", 44), 3);
  assert.equal(playPoints("Extra point", 0), 1);
  assert.equal(playPoints("Sack", null), 1);
  assert.equal(playPoints("Return", 30), 0);
});

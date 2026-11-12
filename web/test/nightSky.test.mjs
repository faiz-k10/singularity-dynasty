import test from "node:test";
import assert from "node:assert/strict";
import { freshState, normalize, award, findOf, pickPairs, gradePicks, eventFor, CATALOGUE_SIZE, FAMILIES, titleOf, litTier, DAY } from "../lib/nightSky.js";

const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ctx = (now, day = "2026-11-11", event = null) => ({ now, day, event });

test("the catalogue has 1,056 entries and rarity follows the odds", () => {
  assert.equal(FAMILIES.length, 44);
  assert.equal(CATALOGUE_SIZE, 1056);
  assert.equal(findOf(0, "silver", "").oneIn, 94); // tier 1 (0.4) / 10 kinds x silver 0.3 x normal
  assert.equal(findOf(37, "violet", "mythic").name, "Mythic Violet Black hole");
  assert.ok(findOf(37, "violet", "mythic").oneIn > 1_000_000);
});

test("each action counts once a day and places at least one star", () => {
  const s = freshState();
  const t0 = Date.UTC(2026, 10, 11, 15);
  assert.equal(award(s, "rankings", ctx(t0), seeded()).awarded, true);
  assert.equal(award(s, "rankings", ctx(t0 + 1000), seeded()).awarded, false);
  assert.equal(award(s, "nope", ctx(t0), seeded()).awarded, false);
  assert.equal(award(s, "rankings", ctx(t0 + DAY, "2026-11-12"), seeded()).awarded, true); // a new day
  assert.ok(s.mass >= 0 && s.actions === 2);
});

test("a new member's first find comes by the second action, and it waits for the telescope", () => {
  const s = freshState();
  const t0 = Date.UTC(2026, 10, 11, 15);
  award(s, "rankings", ctx(t0), () => 0.99); // no collapse on the first
  const r = award(s, "sims", ctx(t0 + 1), () => 0.99);
  assert.equal(r.collapsed, true);
  assert.equal(s.findsTotal, 1);
  assert.equal(s.pending.length, 1);
  assert.ok(s.points > 0 && s.found[s.pending[0].key]);
});

test("about one find every three actions over a long run", () => {
  const rnd = seeded(11);
  const s = freshState();
  let t = Date.UTC(2026, 8, 1, 15);
  const keys = ["board", "waivers", "rankings", "compare", "sims", "lab"];
  for (let d = 0; d < 120; d++, t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    for (const k of keys.slice(0, 3)) award(s, k, ctx(t, day), rnd);
  }
  const perFind = s.actions / s.findsTotal;
  assert.ok(perFind > 2 && perFind < 4.5, `actions per find ${perFind}`);
  assert.ok(Object.keys(s.sets).length >= 5, "sets are reachable");
});

test("the core cools after three quiet days", () => {
  const s = freshState();
  s.mass = 8; s.lastActionAt = Date.UTC(2026, 10, 1);
  award(s, "board", ctx(Date.UTC(2026, 10, 5), "2026-11-05"), () => 0.99);
  assert.ok(s.mass <= 5);
});

test("a finished Singularity guarantees a stellar event", () => {
  const s = freshState();
  s.filled.singularity = s.filled.singularity.map(() => "gold");
  assert.equal(litTier(s, null), 5);
});

test("Beat the Model: three same-position pairs, graded on real points", () => {
  const rows = [];
  for (const pos of ["RB", "WR", "TE"]) for (let i = 0; i < 20; i++) rows.push({ player_name: `${pos}${i}`, position: pos, projection: 20 - i });
  const pairs = pickPairs(rows, 2026, 10);
  assert.equal(pairs.length, 3);
  assert.deepEqual(pickPairs(rows, 2026, 10), pairs); // the same for everyone
  const s = freshState();
  s.picks["2026-10"] = { pairs, choice: [0, 1, null], graded: false };
  const pts = {}; for (const p of pairs) { pts[p.a] = 10; pts[p.b] = 5; }
  const right = gradePicks(s, "2026-10", pts, ctx(Date.UTC(2026, 10, 17)), seeded());
  assert.equal(right, 1);
  assert.deepEqual(s.btm, [1, 1]);
  assert.equal(gradePicks(s, "2026-10", pts, ctx(0), seeded()), 0); // graded once
});

test("events follow the NFL calendar", () => {
  assert.equal(eventFor(new Date(Date.UTC(2026, 10, 12)), 10), "tnf"); // a Thursday in week 10
  assert.equal(eventFor(new Date(Date.UTC(2026, 11, 20)), 16), "eclipse");
  assert.equal(eventFor(new Date(Date.UTC(2027, 3, 25)), 0), "aurora");
  assert.equal(eventFor(new Date(Date.UTC(2026, 10, 15)), 10), null);
});

test("titles and normalising old state", () => {
  assert.equal(titleOf(freshState()), "Spotter");
  const s = normalize({ points: 5 });
  assert.equal(s.points, 5);
  assert.ok(s.filled.singularity.length === 10 && s.boosts.extra === 0);
});

import { complimentsFor } from "../lib/skyCompliments.js";
test("compliments are only true, flattering facts from the member's own leagues", () => {
  const standings = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, wins: 9 - i, losses: i, pf: 1200 - i * 30, isMe: i === 1 }));
  const teams = [{ league_name: "Dynasty Kingdom", settings: { season: { standings }, playoffOdds: 0.82, matchupProj: { mine: 120, opp: 100 }, opponent: "Rival", leagueType: "dynasty" },
    players: [{ name: "Bijan Robinson", isStarter: true, acquired: "pickup", achievements: [{ key: "hero" }] }, { name: "Puka Nacua", isStarter: true, acquired: "pickup", achievements: [{ key: "hero" }, { key: "elitePlayer" }] }] }];
  const heads = complimentsFor(teams).map((c) => c.head);
  assert.ok(heads.includes("2nd of 10 in Dynasty Kingdom"));
  assert.ok(heads.includes("The second-most points in Dynasty Kingdom"));
  assert.ok(heads.includes("Playoffs 82% in Dynasty Kingdom"));
  assert.ok(heads.some((h) => h.startsWith("Your starters out-project Rival's by 20")));
  assert.ok(heads.includes("2 Super Heroes on one roster"));
  assert.ok(heads.includes("2 of your starters came off waivers"));
  const losing = [{ league_name: "L", settings: { season: { standings: standings.map((x) => ({ ...x, isMe: x.rank === 9 })) }, playoffOdds: 0.1 }, players: [] }];
  assert.deepEqual(complimentsFor(losing), []); // nothing flattering is invented
});

import { skyFor, rollSeason, SKY_SETS, CONSTELLATIONS } from "../lib/nightSky.js";
test("every season's sky is a real set with the right star counts, the same for everyone", () => {
  assert.equal(skyFor(2026).map((c) => c.real).join(), "Crux,Sagitta,Cassiopeia,Orion");
  assert.equal(skyFor(2027)[3].real, "Leo");
  assert.equal(skyFor(2026 + SKY_SETS.length)[3].real, "Orion"); // the sets repeat
  for (let y = 2026; y < 2026 + SKY_SETS.length; y++) for (const c of skyFor(y)) {
    assert.equal(c.pts.length, c.n, `${y} ${c.real}`);
    for (const [i, j] of c.edges) assert.ok(c.pts[i] && c.pts[j], `${y} ${c.real} edge`);
    for (const [x, y2] of c.pts) assert.ok(Math.hypot(x, y2) > 95 && Math.abs(x) < 262 && Math.abs(y2) < 262, `${c.real} star clear of the core and inside the sky`);
  }
  assert.equal(CONSTELLATIONS.length, 4);
});
test("a new NFL season starts an empty sky and keeps the old one", () => {
  const s = freshState();
  assert.equal(rollSeason(s, 2026), true);
  s.filled.huddle[0] = "blue";
  assert.equal(rollSeason(s, 2026), false);
  assert.equal(rollSeason(s, 2027), true);
  assert.equal(s.skies[2026].filled.huddle[0], "blue");
  assert.ok(s.filled.huddle.every((x) => x === null));
  const old = normalize({ filled: { huddle: ["blue", null, null, null] } }); // a member from before seasons: keeps their stars this season
  rollSeason(old, 2026);
  assert.equal(old.filled.huddle[0], "blue");
});

import { seasonProgress } from "../lib/nightSky.js";
test("the ladder is one season long: it counts this season's points and finished constellations, then starts over", () => {
  const s = freshState();
  rollSeason(s, 2026);
  for (const id of ["huddle", "blitz", "playbook"]) s.seasonDone[id] = 1;
  s.points = 2200;
  const p = seasonProgress(s);
  assert.equal(p.sky, true); // charted needs only the three smaller constellations
  assert.deepEqual(p.done, [true, true, true, true, true, false, false, false, false, false, false, false]);
  assert.equal(p.title, "Observer");
  assert.equal(p.frame, "silver");
  assert.equal(p.rungs, 5);
  s.seasonDone.singularity = 1;
  assert.deepEqual(unlockSkins(s).map((k) => k.id).filter((id) => id.startsWith("season")), ["season-2026"]); // the limited season skin
  rollSeason(s, 2027);
  assert.equal(s.skies[2026].title, "Observer"); // the career shelf keeps one line per past season
  assert.equal(s.skies[2026].rungs, 6);
  assert.equal(seasonProgress(s).points, 0);
  assert.equal(seasonProgress(s).title, "Spotter");
  assert.equal(seasonProgress(s).rungs, 0);
  assert.equal(unlockSkins(s).filter((k) => k.id === "season-2027").length, 0); // next season's must be earned again
  assert.ok(equipSkin(s, "sky", "season-2026")); // last season's stays wearable
  assert.equal(s.points, 2200); // the lifetime total (used by skins) is never reset
});

import { unlockSkins, equipSkin, equipped, hasSkin } from "../lib/nightSky.js";
test("skins unlock from what the member did, stay unlocked, and only earned ones can be worn", () => {
  const s = freshState();
  assert.equal(equipSkin(s, "sky", "nebula"), false);
  s.points = 2000;
  const got = unlockSkins(s).map((k) => k.id);
  assert.deepEqual(got.sort(), ["nebula", "pulsar"]);
  assert.equal(unlockSkins(s).length, 0); // only once
  s.points = 0; // spending never happens, but a skin stays earned regardless
  assert.ok(hasSkin(s, "core", "pulsar"));
  assert.equal(equipSkin(s, "core", "pulsar"), true);
  assert.equal(equipSkin(s, "core", "quasar"), false);
  assert.deepEqual(equipped(s), { sky: "deep", core: "pulsar" });
});

test("sharing places one lucky star but never heats the core or makes a find", () => {
  const s = freshState();
  const t0 = Date.UTC(2026, 10, 11, 15);
  const r = award(s, "share", ctx(t0), () => 0.01);
  assert.equal(r.awarded, true);
  assert.equal(r.collapsed, undefined);
  assert.equal(s.mass, 0);
  assert.equal(s.findsTotal, 0);
  const lit = Object.values(s.filled).flat().filter(Boolean).length;
  assert.ok(lit === 1 || (lit === 2 && s.filled.singularity.some(Boolean))); // a gold wildcard also lights The Singularity
  assert.equal(award(s, "share", ctx(t0 + 1000), () => 0.01).awarded, false); // once a day
});

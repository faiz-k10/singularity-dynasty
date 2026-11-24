import test from "node:test";
import assert from "node:assert/strict";
import { freshState, normalize, award, findOf, pickPairs, gradePicks, eventFor, CATALOGUE_SIZE, FAMILIES, titleOf, litTier, DAY } from "../lib/nightSky.js";

const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ctx = (now, day = "2026-11-11", event = null) => ({ now, day, event });

test("the catalogue has 1,056 entries and rarity follows the odds", () => {
  assert.equal(FAMILIES.length, 44);
  assert.equal(CATALOGUE_SIZE, 1056);
  assert.equal(findOf(0, "silver", "").oneIn, 94); // tier 1 (0.4) / 10 kinds x silver 0.3 x normal
  assert.equal(findOf(37, "violet", "mythic").name, "Mythic Violet Black Hole");
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
  const keys = ["board", "login", "rankings", "compare", "sims", "lab"];
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
  assert.equal(eventFor(new Date(Date.UTC(2027, 3, 25)), 0), null); // no draft-week aurora any more
  assert.equal(eventFor(new Date(Date.UTC(2026, 10, 15)), 10), null);
  assert.equal(eventFor(new Date(Date.UTC(2026, 10, 26)), 12), "thanksgiving"); // Nov 26 2026 = the fourth Thursday
  assert.equal(eventFor(new Date(Date.UTC(2026, 10, 19)), 11), "tnf"); // the third Thursday stays a plain Thursday
  assert.equal(eventFor(new Date(Date.UTC(2026, 11, 25)), 16), "christmas");
  // exactly one solar flare in every two NFL weeks, never on a Thursday, never outside the regular season
  for (let pair = 1; pair <= 9; pair++) {
    let n = 0;
    for (const week of [pair * 2 - 1, pair * 2]) for (let dow = 0; dow < 7; dow++) {
      const date = new Date(Date.UTC(2026, 9, 4 + dow)); // Oct 4 2026 is a Sunday
      if (eventFor(date, week) === "flare") { n++; assert.notEqual(dow, 4); }
    }
    assert.equal(n, 1);
  }
  assert.equal(eventFor(new Date(Date.UTC(2026, 9, 4)), 0), null);
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

test("the wider set of compliments names his players, reads cleanly and still only says what is true", () => {
  const hero = (wins) => ({ key: "hero", wins });
  const teams = [
    { league_name: "A", settings: { opponent: "Rival", matchupActual: { mine: 110, opp: 90 }, winChance: 0.8, playoffOdds: 0.7 }, players: [
      { name: "Brock Bowers", position: "TE", isStarter: true, acquired: "drafted", myCeiling: 33, achievements: [hero(5), { key: "onFire" }] },
      { name: "Jayden Daniels", position: "QB", isStarter: true, acquired: "drafted", myCeiling: 36, achievements: [{ key: "locked" }, { key: "honorable" }] },
      { name: "Trevor Lawrence", position: "QB", isStarter: true, acquired: "drafted", achievements: [{ key: "locked" }, { key: "honorable" }, { key: "buyLow" }] },
      { name: "Khalil Shakir", position: "WR", isStarter: true, acquired: "drafted", achievements: [hero(1)] },
    ] },
    { league_name: "B", settings: { playoffOdds: 0.9 }, players: [{ name: "Brock Bowers", achievements: [hero(5)] }, { name: "X", achievements: [hero(1)] }, { name: "Y", achievements: [hero(1)] }] },
    { league_name: "C", settings: {}, players: [{ name: "Brock Bowers", achievements: [hero(5)] }] },
  ];
  const heads = complimentsFor(teams).map((c) => c.head);
  assert.ok(heads.includes("Brock Bowers: 5x Super Hero"));
  assert.ok(heads.includes("Brock Bowers is on fire"));
  assert.ok(heads.includes("2 players beating their expected points"));
  assert.ok(heads.includes("Trevor Lawrence is a Buy Low"));
  assert.ok(heads.includes("2 Steady Eddys in your lineup"));
  assert.ok(heads.includes("Jayden Daniels' ceiling this week: 36")); // possessive of a name ending in s
  assert.ok(heads.includes("Up 20 on Rival"));
  assert.ok(!heads.some((h) => h.startsWith("Favored"))); // already ahead: no second line saying so
  assert.ok(heads.includes("You drafted 4 of your starters"));
  assert.ok(heads.includes("Brock Bowers in 3 of your leagues"));
  assert.ok(heads.includes("Playoff-bound in 2 of 3 leagues"));
  assert.ok(heads.includes("4 Super Heroes across your rosters"));
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

import { seasonProgress, LADDER, pickOptions, makeFreePick, skinChoiceOptions, makeSkinChoice, hasTelescope, skySkinsFor, coreSkinsFor } from "../lib/nightSky.js";
test("the ladder is one season long: it counts this season's points and finished constellations, then starts over", () => {
  const s = freshState();
  rollSeason(s, 2026);
  for (const id of ["huddle", "blitz", "playbook"]) s.seasonDone[id] = 1;
  s.points = 3600;
  const p = seasonProgress(s);
  assert.equal(p.sky, true); // charted needs only the three smaller constellations
  assert.deepEqual(p.done, LADDER.map((r, i) => i < 6));
  assert.equal(p.title, "Sojourner");
  assert.equal(p.frame, "star");
  assert.equal(p.rungs, 6);
  assert.ok(hasTelescope(s));
  s.seasonDone.singularity = 1;
  assert.deepEqual(unlockSkins(s).map((k) => k.id).filter((id) => id.startsWith("season")), ["season-2026"]); // the limited season skin
  rollSeason(s, 2027);
  assert.equal(s.skies[2026].title, "Sojourner"); // the career shelf keeps one line per past season
  assert.equal(s.skies[2026].rungs, 7);
  assert.equal(seasonProgress(s).points, 0);
  assert.equal(seasonProgress(s).title, "Spotter");
  assert.equal(hasTelescope(s), false); // perks last one season
  assert.equal(unlockSkins(s).filter((k) => k.id === "season-2027").length, 0); // next season's must be earned again
  assert.ok(equipSkin(s, "sky", "season-2026")); // last season's stays wearable
  assert.equal(s.points, 3600); // the lifetime total is never reset
});

import { unlockSkins, equipSkin, equipped, hasSkin } from "../lib/nightSky.js";
test("ladder skins come from their rungs; a skin already owned comes back as that season's colourway", () => {
  const s = freshState();
  rollSeason(s, 2026);
  assert.equal(equipSkin(s, "sky", "nebula"), false);
  s.points = 2000;
  assert.deepEqual(unlockSkins(s, 1).map((k) => k.id).sort(), ["nebula", "pulsar"]);
  assert.equal(unlockSkins(s, 1).length, 0); // only once
  assert.equal(equipSkin(s, "core", "pulsar"), true);
  assert.equal(equipSkin(s, "core", "quasar"), false);
  assert.deepEqual(equipped(s), { sky: "deep", core: "pulsar" });
  rollSeason(s, 2027);
  s.points += 2000;
  assert.deepEqual(unlockSkins(s, 2).map((k) => k.id).sort(), ["nebula~2027", "pulsar~2027"]);
  assert.ok(skySkinsFor(s).some((k) => k.name === "Nebula 2027"));
  assert.ok(coreSkinsFor(s).some((k) => k.name === "Pulsar 2027"));
  assert.ok(equipSkin(s, "sky", "nebula~2027"));
  assert.equal(equipSkin(s, "sky", "nebula~2028"), false); // not earned
});

test("free picks wait for the catalogue, offer only gaps, mark set-completers and pay no orbit points", () => {
  const s = freshState();
  rollSeason(s, 2026);
  s.points = 1000;
  unlockSkins(s, 1);
  const ch = s.choices.find((c) => c.type === "pick");
  assert.equal(ch.tier, 2);
  assert.equal(seasonProgress(s).title, "Curiosity");
  const fam = FAMILIES.find((f) => f.tier === 2).id;
  assert.equal(makeFreePick(s, ch.key, fam, "silver", { now: 1 }, () => 0.5), null); // the catalogue isn't open yet
  s.findsTotal = 10;
  for (const col of ["silver", "azure"]) s.found[`${fam}|${col}|`] = { n: 1, fam, colour: col, version: "" };
  const opts = pickOptions(s, 2);
  assert.ok(!opts.some((o) => o.fam === fam && o.colour === "silver")); // already found: not offered
  assert.ok(opts.find((o) => o.fam === fam && o.colour === "emerald").completes.includes("Trio"));
  const before = s.points;
  const f = makeFreePick(s, ch.key, fam, "emerald", { now: 2 }, () => 0.5);
  assert.equal(f.colour, "emerald");
  assert.equal(s.points - before, 40); // only the Trio's own points
  assert.equal(s.pending.at(-1).gift, true);
  assert.equal(s.choices.length, 0);
  assert.equal(makeFreePick(s, ch.key, fam, "violet", { now: 3 }), null); // used up
});

test("the 20,000 rung offers the next locked sky or core skin, never a ladder or limited one", () => {
  const s = freshState();
  rollSeason(s, 2026);
  s.points = 20000;
  unlockSkins(s, 1);
  const ch = s.choices.find((c) => c.type === "skin");
  const opts = skinChoiceOptions(s);
  assert.ok(opts.every((o) => !["nebula", "aurora", "pulsar"].includes(o.id)));
  assert.equal(makeSkinChoice(s, ch.key, "core", "horizon"), false); // not the next one
  const o = opts.find((x) => x.kind === "core");
  assert.ok(makeSkinChoice(s, ch.key, o.kind, o.id, 1));
  assert.ok(hasSkin(s, o.kind, o.id));
  assert.equal(s.choices.some((c) => c.type === "skin"), false);
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

test("the rarest find takes its astronomical zone and never covers a constellation", async () => {
  const { placeFind, zoneOf } = await import("../lib/skyPlacement.js");
  const { skyFor } = await import("../lib/nightSky.js");
  for (const season of [2026, 2027, 2028, 2029]) {
    const sky = skyFor(season);
    for (const f of FAMILIES) {
      const p = placeFind(f.id, sky, { w: 600, h: 600 });
      const z = zoneOf(f.id);
      assert.ok(Math.abs(Math.hypot(p.x, p.y) - z.r) < 1, `${f.name} stays on its zone's radius`);
      for (const c of sky) for (const [x, y] of c.pts) assert.ok(Math.hypot(p.x - x, p.y - y) > z.size / 2, `${f.name} clear of ${c.name} (${season})`);
    }
  }
  const lava = FAMILIES.find((f) => f.name === "Lava World").id, quasar = FAMILIES.find((f) => f.name === "Quasar").id;
  assert.ok(zoneOf(lava).r < zoneOf(quasar).r, "planets orbit close, deep-sky objects sit far out");
});

test("every catalogue entry has its own lore", async () => {
  const { loreFor, COLOURS, VERSIONS } = await import("../lib/nightSky.js");
  const seen = new Set();
  for (const f of FAMILIES) for (const c of COLOURS) for (const v of VERSIONS) seen.add(loreFor(f.id, c.id, v.id));
  assert.equal(seen.size, CATALOGUE_SIZE);
});

test("the 9,000 pick is a meteor shower and the 12,000 pick spans every tier but stellar events", () => {
  const s = freshState();
  rollSeason(s, 2026);
  s.points = 12000; s.findsTotal = 10;
  unlockSkins(s, 1);
  const tiers = s.choices.filter((c) => c.type === "pick").map((c) => c.tier);
  assert.deepEqual(tiers, [2, 3, 4, [1, 2, 3, 4]]);
  const any = s.choices.at(-1);
  const opts = pickOptions(s, any.tier);
  assert.ok([1, 2, 3, 4].every((t) => opts.some((o) => FAMILIES[o.fam].tier === t)));
  assert.ok(!opts.some((o) => FAMILIES[o.fam].tier === 5));
  const fam = FAMILIES.find((f) => f.tier === 1).id;
  assert.ok(makeFreePick(s, any.key, fam, "silver", { now: 2 }, () => 0.5));
  const star = FAMILIES.find((f) => f.tier === 5).id;
  s.choices.push({ key: "x", type: "pick", tier: [1, 2, 3, 4] });
  assert.equal(makeFreePick(s, "x", star, "silver", { now: 3 }), null); // stellar events can't be picked here
});

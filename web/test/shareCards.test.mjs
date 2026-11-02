import { test } from "node:test";
import assert from "node:assert/strict";
import { signCard, readCardToken, cleanCard } from "../lib/cardToken.js";
import { pickStart, startValue } from "../lib/startSit.js";
import { weekReceipts, rangeVerdict } from "../lib/receipts.js";
import { smashSpots } from "../lib/smashSpots.js";

const SECRET = "test-secret";

test("card tokens: round trip, tamper-proof, only known shapes", () => {
  const card = { k: "p", s: 2026, w: 8, n: "Josh Allen", pos: "QB", extra: "dropped" };
  const t = signCard(card, SECRET);
  assert.deepEqual(readCardToken(t, SECRET), { k: "p", s: 2026, w: 8, n: "Josh Allen", pos: "QB" });
  assert.equal(readCardToken(t, "other-secret"), null);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "p", s: 2026, w: 8, n: "Ja'Marr Chase", pos: "WR" })).toString("base64url");
  assert.equal(readCardToken(`${forged}.${sig}`, SECRET), null);
  assert.equal(readCardToken(`${body}.${sig.slice(0, -1)}x`, SECRET), null);
  assert.equal(readCardToken("nope", SECRET), null);
  assert.equal(signCard({ k: "p", s: 2026, w: 8, n: "X", pos: "QB" }, SECRET), null); // name too short
  assert.equal(cleanCard({ k: "s", s: 2026, w: 8, a: ["Same Guy", "RB"], b: ["Same Guy", "RB"] }), null);
  assert.deepEqual(cleanCard({ k: "d", id: "00-0034857", f: "sf", m: "rebuilder" }), { k: "d", id: "00-0034857", f: "sf", m: "rebuilder" });
  assert.equal(cleanCard({ k: "d", id: "00-0034857", f: "2qb", m: "rebuilder" }), null);
});

test("start / sit: median plus the matchup effect, coin flips say so", () => {
  assert.equal(startValue(12, 2.4), 14.4);
  assert.equal(startValue(null, 2), null);
  assert.deepEqual(pickStart({ projection: 12, effect: 0 }, { projection: 11, effect: 2.4 }), { pick: "b", gain: 1.4 });
  assert.deepEqual(pickStart({ projection: 12 }, { projection: 12.04 }), { pick: null, gain: 0 });
  assert.deepEqual(pickStart({ projection: 15 }, { projection: 10, effect: -2 }), { pick: "a", gain: 7 });
});

const leans = [
  { defense: "MIA", position: "RB", call: "SMASH", score: 3.4, effect: 2.6, rank_now: 1, rank_prior: 3 },
  { defense: "SF", position: "WR", call: "AVOID", score: 3.1, effect: -2.2, rank_now: 31, rank_prior: null },
  { defense: "NYJ", position: "TE", call: "SMASH", score: 2.0, effect: 1.0, rank_now: 5, rank_prior: null }, // too weak to flag
];

test("receipts: range hit rates, spots vs median, ceiling games", () => {
  const rankRows = [
    { player_name: "A Back", position: "RB", team: "BUF", opponent: "MIA", projection: 14, floor: 5, ceiling: 25 },
    { player_name: "B Back", position: "RB", team: "BUF", opponent: "MIA", projection: 8, floor: 2, ceiling: 16 },
    { player_name: "C Wide Jr.", position: "WR", team: "LAR", opponent: "SF", projection: 13, floor: 4, ceiling: 24 },
    { player_name: "D Wide", position: "WR", team: "KC", opponent: "LV", projection: 10, floor: 3, ceiling: 20 },
    { player_name: "E Deep", position: "WR", team: "KC", opponent: "LV", projection: 3, floor: 0, ceiling: 9 }, // under 5: out
    { player_name: "F Out", position: "QB", team: "KC", opponent: "LV", projection: 18, floor: 9, ceiling: 28 }, // no game: out
  ];
  const games = [
    { player_name: "A Back", position: "RB", fantasy_points_ppr: 31.5 },
    { player_name: "B Back", position: "RB", fantasy_points_ppr: 6 },
    { player_name: "C Wide", position: "WR", fantasy_points_ppr: 2 }, // suffix dropped in the log: still matches
    { player_name: "D Wide", position: "WR", fantasy_points_ppr: 11 },
    { player_name: "E Deep", position: "WR", fantasy_points_ppr: 30 },
  ];
  const r = weekReceipts({ rankRows, games, leanRows: leans });
  assert.equal(r.n, 4);
  assert.deepEqual(r.over, { n: 1, pct: 25 });
  assert.deepEqual(r.under, { n: 1, pct: 25 });
  assert.deepEqual(r.inside, { n: 2, pct: 50 });
  assert.equal(r.smash.n, 2);
  assert.equal(r.smash.hits, 1);
  assert.equal(r.smash.vsMedian, 7.8); // (17.5 + -2) / 2 = 7.75
  assert.equal(r.smash.best[0].name, "A Back");
  assert.equal(r.tough.n, 1);
  assert.equal(r.tough.hits, 1);
  assert.equal(r.ceilingGames[0].name, "A Back");
  assert.equal(rangeVerdict(r), "A big week for ceilings: more players beat their range than usual.");
  assert.equal(rangeVerdict({ n: 100, over: { pct: 11 }, under: { pct: 9 } }), "The ranges ran right on target.");
});

test("smash spots: flagged leans someone faces, players from the free top 50 only", () => {
  const rankRows = [
    { player_name: "A Back", position: "RB", team: "BUF", opponent: "MIA", projection: 14, rank: 12 },
    { player_name: "B Back", position: "RB", team: "BUF", opponent: "MIA", projection: 8, rank: 140 },
    { player_name: "C Wide", position: "WR", team: "LAR", opponent: "SF", projection: 9, rank: 88 },
    { player_name: "T End", position: "TE", team: "NE", opponent: "NYJ", projection: 9, rank: 40 },
  ];
  const { smash, tough } = smashSpots({ rankRows, leanRows: leans });
  assert.equal(smash.length, 1);
  assert.deepEqual(smash[0].players, [{ name: "A Back", projection: 14 }]);
  assert.equal(smash[0].offense, "BUF");
  assert.equal(tough.length, 1);
  assert.deepEqual(tough[0].players, []); // C Wide is past the free top 50: the card says "LAR WRs" only
  assert.equal(tough[0].offense, "LAR");
});

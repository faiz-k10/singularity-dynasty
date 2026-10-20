import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLineup } from "../lib/bestBall.js";

const POS = { q1: "QB", q2: "QB", q3: "QB", r1: "RB", r2: "RB", r3: "RB", w1: "WR", w2: "WR", w3: "WR", w4: "WR", t1: "TE", t2: "TE", k1: "K" };
const posOf = (id) => POS[id];
const SLOTS = ["QB", "QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX"];

test("bestLineup: the best possible lineup from every player's points, fixed positions first, then FLEX, then SUPER_FLEX", () => {
  const points = { q1: 20, q2: 15, q3: 12, r1: 18, r2: 9, r3: 8, w1: 25, w2: 14, w3: 11, w4: 10, t1: 7, t2: 6 };
  const { total, picks } = bestLineup(points, posOf, SLOTS);
  // QB 20 + 15, RB 18 + 9, WR 25 + 14 + 11, TE 7, FLEX = best two of {r3 8, w4 10, t2 6} = 10 + 8, SUPER_FLEX = best left of all = q3 12
  assert.equal(total, 20 + 15 + 18 + 9 + 25 + 14 + 11 + 7 + 10 + 8 + 12);
  assert.equal(picks.length, 11);
  assert.equal(new Set(picks.map((p) => p.id)).size, 11); // nobody is used twice
});

test("bestLineup: a player only fills a slot his position can play; unknown positions and empty slots are skipped", () => {
  // Only one QB scored; the second QB slot stays empty, the SUPER_FLEX takes the best other player.
  const { total, picks } = bestLineup({ q1: 30, r1: 10, mystery: 99 }, posOf, ["QB", "QB", "SUPER_FLEX"]);
  assert.equal(total, 40);
  assert.deepEqual(picks.map((p) => [p.id, p.slot]), [["q1", "QB"], ["r1", "SUPER_FLEX"]]);
  assert.equal(bestLineup(null, posOf, SLOTS).total, 0);
  assert.equal(bestLineup({ k1: 8 }, posOf, ["K"]).total, 8);
});

test("bestLineup: negative scores are only used when a slot has nobody better", () => {
  assert.equal(bestLineup({ q1: -2, q2: 5 }, posOf, ["QB"]).total, 5);
  assert.equal(bestLineup({ q1: -2 }, posOf, ["QB"]).total, -2);
});

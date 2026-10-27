import { test } from "node:test";
import assert from "node:assert/strict";
import { standing, lockIn } from "../lib/standing.js";

// A summarizeSide()-shaped lineup: players with their outlook (state + share of the game left).
const player = (pos, state, frac, extra = {}) => ({ pos, outlook: { state, frac }, ...extra });
const side = (...players) => ({ players });

test("standing: the one-word reading from the win chance", () => {
  assert.equal(standing(0.7, false).label, "Favored");
  assert.equal(standing(0.5, false).label, "Toss-up");
  assert.equal(standing(0.3, false).label, "Underdog");
  // Underdog is 15% up to (not including) 40%; Toss-up starts at 40%; below 15% is a Long shot.
  assert.equal(standing(0.15, false).label, "Underdog");
  assert.equal(standing(0.399, false).label, "Underdog");
  assert.equal(standing(0.4, false).label, "Toss-up");
  assert.equal(standing(0.149, false).label, "Long shot");
  assert.equal(standing(null, false).label, null);
  assert.equal(standing(1, true).label, "Won");
  assert.equal(standing(0, true).label, "Lost");
});

test("standing: YOU WIN / Out of reach come ONLY from a lock, never from the percentage", () => {
  // Even 99.99% is just "Favored" without a lock, and 0.01% is a "Long shot", never "Out of reach".
  assert.equal(standing(0.9999, false, null).label, "Favored");
  assert.equal(standing(0.0001, false, null).label, "Long shot");
  assert.equal(standing(0.1, false, null).label, "Long shot");
  assert.equal(standing(0.5, false, "win").label, "You win");
  assert.equal(standing(0.5, false, "loss").label, "Out of reach");
  // A finished game is Won / Lost whatever the lock says.
  assert.equal(standing(1, true, "win").label, "Won");
});

test("lockIn: nobody left on the other side and a clear lead -> locked; any realistic comeback still possible -> not", () => {
  const done = side(player("WR", "post", 0), player("RB", "post", 0));
  // Opponent finished, I lead by 14 with two players still playing late (a quarter left): 14 > 2 x 12 x .25 (6) + 3 -> locked.
  assert.equal(lockIn(side(player("RB", "in", 0.25), player("WR", "in", 0.25)), done, 143.8, 129.8), "win");
  // Same lead but my players still have the whole game to play: they could lose 24 -> not locked.
  assert.equal(lockIn(side(player("RB", "pre", 1), player("WR", "pre", 1)), done, 143.8, 129.8), null);
  // The opponent has one WR playing with a quarter left (up to 75 x .25 = 18.75): a 14-point lead is not safe, a 64-point lead is.
  const oneLeft = side(player("WR", "in", 0.25));
  assert.equal(lockIn(done, oneLeft, 140, 126), null);
  assert.equal(lockIn(done, oneLeft, 189.7, 125.3), "win");
  // A thin lead never locks (stat corrections alone could erase it): 1 point up with everyone done.
  assert.equal(lockIn(done, done, 100.5, 99.5), null);
  // Never locked while the scoreboard is unknown (no state): everything counts as a whole game to play.
  assert.equal(lockIn(side(player("QB", null, null)), side(player("QB", null, null)), 150, 100), null);
  // The mirror: out of reach only when even a huge game from every player I have left can't close the gap.
  assert.equal(lockIn(side(player("TE", "in", 0.25)), done, 80, 150), "loss");
  assert.equal(lockIn(side(player("TE", "in", 0.25)), done, 80, 90), null); // 10 down: my TE could still add up to 15
  assert.equal(lockIn(side(player("TE", "in", 0.25)), done, 80, 100), "loss"); // 20 down, and he can add at most 15 (+3 cushion)
  // Inactive players never score, so they never keep a matchup alive.
  assert.equal(lockIn(done, side(player("WR", "pre", 1, { out: true })), 120, 100), "win");
  // Missing data -> no lock.
  assert.equal(lockIn(null, done, 100, 50), null);
  assert.equal(lockIn(done, done, null, 50), null);
});

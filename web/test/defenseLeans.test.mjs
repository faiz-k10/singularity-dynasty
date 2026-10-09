import test from "node:test";
import assert from "node:assert/strict";
import { indexLeans, flagFor } from "../lib/defenseLeans.js";

const leans = indexLeans([
  { defense: "DAL", position: "QB", call: "SMASH", score: 4.34, effect: 3.39, rank_now: 2, rank_prior: 1 },
  { defense: "MIN", position: "QB", call: "AVOID", score: 3.82, effect: -2.76, rank_now: 32, rank_prior: 32 },
  { defense: "JAX", position: "RB", call: "AVOID", score: 2.84, effect: -0.65, rank_now: 24, rank_prior: 31 },
  { defense: "CIN", position: "TE", call: "SMASH", score: 3.75, effect: 3.21, rank_now: 6, rank_prior: null },
]);

test("a strong smash lean flags the matchup and explains itself", () => {
  const f = flagFor(leans, "DAL", "QB");
  assert.equal(f.call, "SMASH");
  assert.match(f.text, /^Smash spot: DAL has been giving up QB scoring \(\+3\.4 pts\/game/);
  assert.match(f.text, /2nd most generous this season, and 1st most generous last season too/);
  assert.match(f.text, /not part of the projection/);
});

test("a stingy defense is described by its stingiest rank, not its generosity rank", () => {
  const f = flagFor(leans, "MIN", "QB");
  assert.equal(f.call, "AVOID");
  assert.match(f.text, /1st stingiest this season, and 1st stingiest last season too/);
  assert.match(f.text, /\(−2\.8 pts\/game/);
});

test("leans below the flag threshold, or for another position, show nothing", () => {
  assert.equal(flagFor(leans, "JAX", "RB"), null); // 2.84 < 3.0
  assert.equal(flagFor(leans, "JAX", "RB", 2.5).call, "AVOID"); // unless the threshold is lowered
  assert.equal(flagFor(leans, "DAL", "RB"), null);
});

test("missing prior-season history and missing inputs are handled", () => {
  assert.doesNotMatch(flagFor(leans, "CIN", "TE").text, /last season/);
  assert.equal(flagFor(leans, null, "QB"), null);
  assert.equal(flagFor(null, "DAL", "QB"), null);
});

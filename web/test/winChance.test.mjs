import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gameFractionLeft,
  buildSide,
  playerOutlook,
  summarizeSide,
  simulateWinChance,
  matchupOutlook,
  DEFAULT_RANGES,
} from "../lib/winChance.js";

const pre = { state: "pre", detail: "10/19 - 8:15 PM EDT", period: 0, clock: 0 };
const post = { state: "post", detail: "Final", period: 4, clock: 0 };
const half = { state: "in", detail: "Halftime", period: 2, clock: 0 };

test("gameFractionLeft: pre 1, final 0, live from period + clock, unknown null", () => {
  assert.equal(gameFractionLeft(pre), 1);
  assert.equal(gameFractionLeft(post), 0);
  assert.equal(gameFractionLeft(half), 0.5);
  assert.equal(gameFractionLeft({ state: "in", period: 1, clock: 283 }), (45 + 283 / 60) / 60);
  assert.equal(gameFractionLeft({ state: "in", period: 4, clock: 450 }), 7.5 / 60);
  assert.equal(gameFractionLeft({ state: "in", period: 5, clock: 300 }), 5 / 60); // overtime
  assert.equal(gameFractionLeft({ state: "in" }), 0.5); // live, no clock: documented midpoint
  assert.equal(gameFractionLeft(null), null);
});

test("buildSide keeps slot order, empty slots, projections, fallbacks and points", () => {
  const info = {
    1: { name: "Josh Allen", pos: "QB", team: "BUF", active: true },
    2: { name: "Some Kicker", pos: "K", team: "DAL", active: true },
    3: { name: "Hurt Guy", pos: "RB", team: "NYG", active: false },
  };
  const proj = { "josh allen": { proj: 22, floor: 14, ceiling: 34 } };
  const side = buildSide(
    ["1", "0", "2", "3"],
    ["QB", "RB", "K", "FLEX"],
    (id) => info[id],
    (name) => proj[name.toLowerCase()] || null,
    { 1: 18.5, 2: 0 }
  );
  assert.equal(side.length, 4);
  assert.deepEqual(side[0], { id: "1", slot: "QB", name: "Josh Allen", pos: "QB", team: "BUF", proj: 22, floor: 14, ceiling: 34, pts: 18.5 });
  assert.deepEqual(side[1], { id: null, slot: "RB" });
  assert.equal(side[2].est, true);
  assert.equal(side[2].proj, DEFAULT_RANGES.K.proj);
  assert.equal(side[3].proj, 0); // inactive: not playing
  assert.equal(side[3].out, true);
  assert.equal(side[3].pts, null);
});

test("playerOutlook: final = points only, pre = full range, half game = half the median", () => {
  const p = { id: "1", pos: "WR", team: "GB", proj: 14, floor: 6, ceiling: 28, pts: 9 };
  const done = playerOutlook(p, { GB: post });
  assert.equal(done.pts, 9);
  assert.equal(done.mid, 0);
  assert.equal(done.sdLo + done.sdHi, 0);

  const before = playerOutlook({ ...p, pts: 0 }, { GB: pre });
  assert.equal(before.pts, null); // dash before kickoff
  assert.equal(before.mid, 14);
  assert.ok(Math.abs(before.lo - 6) < 1e-9); // 10th percentile = floor

  const mid = playerOutlook(p, { GB: half });
  assert.equal(mid.pts, 9);
  assert.equal(mid.mid, 7);
  assert.ok(Math.abs(mid.sdLo - Math.sqrt(0.5) * (8 / 1.2816)) < 1e-9);

  const bye = playerOutlook(p, { DAL: pre });
  assert.equal(bye.state, "bye");
  assert.equal(bye.mid, 0);

  const unknown = playerOutlook(p, null);
  assert.equal(unknown.state, null);
  assert.equal(unknown.pts, null);
  assert.equal(unknown.mid, 14);
});

test("summarizeSide counts players left and the projected final", () => {
  const gs = { GB: half, DAL: half, SF: pre, KC: post };
  const s = summarizeSide(
    [
      { id: "a", pos: "QB", team: "GB", proj: 20, floor: 12, ceiling: 32, pts: 10 },
      { id: "b", pos: "RB", team: "SF", proj: 12, floor: 4, ceiling: 24, pts: 0 },
      { id: "c", pos: "WR", team: "KC", proj: 13, floor: 5, ceiling: 25, pts: 21 },
      { id: null, slot: "FLEX" },
    ],
    gs
  );
  assert.equal(s.pts, 31);
  assert.equal(s.projFinal, 31 + 10 + 12);
  assert.equal(s.yetToPlay, 1);
  assert.equal(s.playing, 1);
});

test("simulateWinChance: settled matchups are certain, even ones near 50%, bigger leads win more", () => {
  const gs = { GB: post, SF: pre };
  const done = (pts) => summarizeSide([{ id: "x", pos: "WR", team: "GB", proj: 10, floor: 3, ceiling: 20, pts }], gs);
  assert.equal(simulateWinChance(done(20), done(10)), 1);
  assert.equal(simulateWinChance(done(10), done(20)), 0);
  assert.equal(simulateWinChance(done(10), done(10)), 0.5);

  const same = summarizeSide([{ id: "y", pos: "RB", team: "SF", proj: 12, floor: 4, ceiling: 24, pts: 0 }], gs);
  const even = simulateWinChance(same, same, { draws: 20000 });
  assert.ok(Math.abs(even - 0.5) < 0.03, `even matchup ${even}`);

  const lead5 = simulateWinChance({ ...same, pts: 5 }, same);
  const lead15 = simulateWinChance({ ...same, pts: 15 }, same);
  assert.ok(lead5 > 0.55 && lead15 > lead5 && lead15 < 1);
});

test("simulateWinChance is deterministic for the same inputs", () => {
  const gs = { SF: pre };
  const a = summarizeSide([{ id: "1", pos: "QB", team: "SF", proj: 20, floor: 11, ceiling: 34, pts: 0 }], gs);
  const b = summarizeSide([{ id: "2", pos: "QB", team: "SF", proj: 17, floor: 9, ceiling: 30, pts: 0 }], gs);
  assert.equal(simulateWinChance(a, b), simulateWinChance(a, b));
  assert.ok(simulateWinChance(a, b) > 0.55);
});

test("matchupOutlook: null without lineups, null win chance when points are up but the scoreboard is unknown", () => {
  assert.equal(matchupOutlook(null, {}), null);
  const h2h = {
    mine: [{ id: "1", pos: "QB", team: "SF", proj: 20, floor: 11, ceiling: 34, pts: 4 }],
    opp: [{ id: "2", pos: "QB", team: "GB", proj: 17, floor: 9, ceiling: 30, pts: 0 }],
  };
  assert.equal(matchupOutlook(h2h, null).winChance, null);
  const pregame = { ...h2h, mine: [{ ...h2h.mine[0], pts: null }] };
  const o = matchupOutlook(pregame, null);
  assert.ok(o.winChance > 0.5 && o.winChance < 1);
  assert.equal(o.mine.projFinal, 20);
});

import { simulateWinChance as _sim, summarizeSide as _sum } from "../lib/winChance.js";
test("a late-scratch allowance: a team behind with two starters still to play is never 'certain'", () => {
  const gs = { SF: { state: "pre", start: "2026-10-20T00:15Z" }, DAL: { state: "post" } };
  const mine = _sum([{ id: "a", name: "A", pos: "RB", team: "SF", proj: 20.8, floor: 13.8, ceiling: 39.8, pts: 0 }, { id: "b", name: "B", pos: "TE", team: "SF", proj: 15.6, floor: 6.1, ceiling: 26.1, pts: 0 }, { id: "c", name: "C", pos: "WR", team: "DAL", proj: 10, floor: 3, ceiling: 20, pts: 97 }], gs);
  const opp = _sum([{ id: "d", name: "D", pos: "WR", team: "DAL", proj: 10, floor: 3, ceiling: 20, pts: 110.2 }], gs);
  const p = _sim(mine, opp, { draws: 40000 });
  assert.ok(p > 0.95 && p < 0.995, `expected a high but not locked-in chance, got ${p}`);
});

test("a starter missing from the player directory is a typical-range unknown, not Out (CJ Daniels, a rookie the crosswalk hadn't linked)", () => {
  const side = buildSide(["13270"], ["WR"], () => null, () => null, {});
  assert.equal(side[0].out, undefined);
  assert.equal(side[0].est, true);
  assert.equal(side[0].name, "Player 13270");
  assert.equal(side[0].proj, 6); // the typical range when the position is unknown (OTHER_RANGE)
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveFeed, trackScoring, sortFeed, isGameDay } from "../lib/liveFeed.js";

const gs = {
  GB: { state: "in", detail: "4:43 - 1st", start: "2026-10-19T00:20Z" },
  JAX: { state: "post", detail: "Final", start: "2026-10-18T13:30Z" },
  SF: { state: "pre", detail: "10/19 - 8:15 PM EDT", start: "2026-10-20T00:15Z" },
};
const love = (pts) => ({ id: "6804", name: "Jordan Love", pos: "QB", team: "GB", proj: 18.8, pts });
const lawrence = { id: "7523", name: "Trevor Lawrence", pos: "QB", team: "JAX", proj: 19.3, pts: 36.09 };
const cmc = { id: "4034", name: "Christian McCaffrey", pos: "RB", team: "SF", proj: 21, pts: 0 };

const team = (id, league, mine, extra = {}, opp = []) => ({ id, league_name: league, settings: { h2h: { mine, opp }, opponent: "Rival", ...extra } });

test("buildLiveFeed: only players on the field now, yours and theirs, starts counted per league", () => {
  const feed = buildLiveFeed(
    [
      team("a", "League A", [love(10.36), lawrence, cmc, { id: null, slot: "FLEX" }], {}, [{ ...lawrence, pts: 30 }, { id: "9", name: "Bo Nix", pos: "QB", team: "GB", proj: 17, pts: 4.2 }]),
      team("b", "League B", [love(8.1)]),
      team("c", "Best Ball", [love(9)], { bestBall: true }),
    ],
    gs
  );
  assert.deepEqual(feed.mine.map((r) => r.playerId), ["6804"]); // Lawrence is final, CMC not started, best ball skipped
  const l = feed.mine[0];
  assert.equal(l.starts.length, 2);
  assert.equal(l.pts, 10.36);
  assert.equal(l.ptsMin, 8.1);
  assert.equal(feed.mineTotal, Math.round((10.36 + 8.1) * 10) / 10);
  assert.deepEqual(feed.theirs.map((r) => r.name), ["Bo Nix"]);
  assert.equal(feed.theirs[0].starts[0].opponent, "Rival");
  assert.equal(feed.theirsTotal, 4.2);
  assert.equal(feed.nextStart, gs.SF.start);
  // one league only
  const one = buildLiveFeed([team("a", "A", [love(3)]), team("b", "B", [love(5)])], gs, { onlyTeamId: "b" });
  assert.equal(one.mine[0].starts.length, 1);
  assert.equal(one.mine[0].pts, 5);
  assert.deepEqual(buildLiveFeed([team("a", "A", [love(1)])], null).mine, []);
});

test("trackScoring + sortFeed: newest scoring first, nothing 'new' on the first load", () => {
  const bo = (pts) => ({ id: "9", name: "Bo Nix", pos: "QB", team: "GB", proj: 17, pts });
  const rows1 = buildLiveFeed([team("a", "A", [love(10), bo(12)])], gs).mine;
  const t1 = trackScoring(null, rows1, 1000);
  assert.deepEqual(t1.changedAt, {});
  assert.deepEqual(sortFeed(rows1, t1.changedAt).map((r) => r.playerId), ["9", "6804"]); // first load: by points
  const rows2 = buildLiveFeed([team("a", "A", [love(16.2), bo(12)])], gs).mine;
  const t2 = trackScoring(t1, rows2, 2000);
  assert.equal(t2.changedAt["mine:6804"], 2000);
  assert.equal(t2.delta["mine:6804"], 6.2);
  assert.equal(t2.changedAt["mine:9"], undefined);
  assert.deepEqual(sortFeed(rows2, t2.changedAt).map((r) => r.playerId), ["6804", "9"]);
  const t3 = trackScoring(t2, rows2, 3000); // no change: keeps the old stamp
  assert.equal(t3.changedAt["mine:6804"], 2000);
});

test("isGameDay: a live game, a kickoff today, or Thu/Sun/Mon without a scoreboard", () => {
  assert.equal(isGameDay(gs, new Date("2026-10-21T12:00:00")), true); // GB in progress
  const quiet = { JAX: { state: "post", start: "2026-10-18T17:00:00" } };
  assert.equal(isGameDay(quiet, new Date("2026-10-18T20:00:00")), true);
  assert.equal(isGameDay(quiet, new Date("2026-10-21T12:00:00")), false);
  assert.equal(isGameDay(null, new Date("2026-10-18T12:00:00")), true); // Sunday
  assert.equal(isGameDay(null, new Date("2026-10-21T12:00:00")), false); // Wednesday
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustedMatchup } from "../lib/adjustedMatchup.js";
import { buildLiveFeed, trackScoring, sortFeed, isGameDay, formatCountdown, pendingFor, applyPending, applyPendingToLineup } from "../lib/liveFeed.js";

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

test("trackScoring: a player who newly appears (or comes back after the list narrowed) is not 'new'", () => {
  const row = (id, pts) => ({ id: `mine:${id}`, pts });
  const t1 = trackScoring(null, [row("a", 12), row("b", 3.8)], 1000);
  // The board narrows to one league: only b is listed. Then it widens again with a (unchanged) and c (appearing with points).
  const t2 = trackScoring(t1, [row("b", 3.8)], 2000);
  const t3 = trackScoring(t2, [row("a", 12), row("b", 3.8), row("c", 4.4)], 3000);
  assert.deepEqual(t3.changedAt, {}); // nobody flashes
  assert.deepEqual(t3.delta, {});
  // A real change after that still flashes, with the right amount.
  const t4 = trackScoring(t3, [row("a", 12), row("b", 5.0), row("c", 4.4)], 4000);
  assert.equal(t4.changedAt["mine:b"], 4000);
  assert.equal(t4.delta["mine:b"], 1.2);
  assert.equal(t4.changedAt["mine:a"], undefined);
});

test("isGameDay: a live game, a kickoff today, or Thu/Sun/Mon without a scoreboard", () => {
  assert.equal(isGameDay(gs, new Date("2026-10-21T12:00:00")), true); // GB in progress
  const quiet = { JAX: { state: "post", start: "2026-10-18T17:00:00" } };
  assert.equal(isGameDay(quiet, new Date("2026-10-18T20:00:00")), true);
  assert.equal(isGameDay(quiet, new Date("2026-10-21T12:00:00")), false);
  assert.equal(isGameDay(null, new Date("2026-10-18T12:00:00")), true); // Sunday
  assert.equal(isGameDay(null, new Date("2026-10-21T12:00:00")), false); // Wednesday
});

test("buildLiveFeed: nextUp names the next kickoff's games and counts your / their starters in them", () => {
  const g = {
    SF: { state: "pre", start: "2026-10-20T00:15Z", eventId: "e1", home: true },
    WAS: { state: "pre", start: "2026-10-20T00:15Z", eventId: "e1", home: false },
    GB: { state: "post", start: "2026-10-19T00:20Z", eventId: "e0" },
  };
  const p = (id, t) => ({ id, name: id, pos: "WR", team: t, proj: 10, pts: 0 });
  const feed = buildLiveFeed([team("a", "A", [p("1", "SF"), p("2", "WAS"), p("3", "GB")], {}, [p("4", "SF")])], g);
  assert.equal(feed.nextStart, "2026-10-20T00:15Z");
  assert.deepEqual(feed.nextUp, { games: [["WAS", "SF"]], mine: 2, theirs: 1 }); // away team first
  assert.equal(feed.anyLeft, true);
  const done = buildLiveFeed([team("a", "A", [p("3", "GB")])], g);
  assert.equal(done.nextUp, null);
  assert.equal(done.anyLeft, false);
});

test("formatCountdown ticks down to the second, with days past 24 hours", () => {
  assert.equal(formatCountdown(7 * 3600e3 - 1000), "6:59:59");
  assert.equal(formatCountdown(3600e3 + 5 * 60e3 + 9e3), "1:05:09");
  assert.equal(formatCountdown(59e3), "0:00:59");
  assert.equal(formatCountdown(26 * 3600e3 + 2 * 60e3 + 3e3), "1d 02:02:03");
  assert.equal(formatCountdown(-5000), "0:00:00");
});

test("pendingFor: the plays Sleeper has not posted yet are the ones after the play its number matches", () => {
  // Daniels' plays, oldest first: +0.3 +0.3 +0.4 +1.1 +1.2. Sleeper has 2.1 = the first four, so +1.2 is pending.
  const plays = [0.3, 0.3, 0.4, 1.1, 1.2];
  assert.equal(pendingFor([{ pts: 2.1 }], plays), 1.2);
  // Sleeper caught up -> nothing pending. Sleeper at 0 and no plays counted yet -> everything is pending.
  assert.equal(pendingFor([{ pts: 3.3 }], plays), 0);
  assert.equal(pendingFor([{ pts: 0 }], plays), 3.3);
  // A number that matches no point of the running total (half-PPR, a bonus, a play we don't list) -> no guess.
  assert.equal(pendingFor([{ pts: 2.6 }], plays), 0);
  // Several leagues must agree on the pending amount; scoring that differs in one of them -> no guess.
  assert.equal(pendingFor([{ pts: 2.1 }, { pts: 2.1 }], plays), 1.2);
  assert.equal(pendingFor([{ pts: 2.1 }, { pts: 1.0 }], plays), 0);
  // No plays at all.
  assert.equal(pendingFor([{ pts: 2.1 }], []), 0);
  assert.equal(pendingFor([{ pts: 2.1 }], undefined), 0);
});

test("applyPending: adds the pending points to the row's numbers and marks it", () => {
  const rows = [
    { id: "mine:a", playerId: "a", pts: 2.1, ptsMin: 2.1, total: 4.2, starts: [{ pts: 2.1 }, { pts: 2.1 }] },
    { id: "mine:b", playerId: "b", pts: 5, ptsMin: 5, total: 5, starts: [{ pts: 5 }] },
  ];
  const out = applyPending(rows, { a: [0.3, 0.3, 0.4, 1.1, 1.2], b: [1, 2, 3] });
  assert.equal(out[0].pts, 3.3);
  assert.equal(out[0].ptsMin, 3.3);
  assert.equal(out[0].total, 6.6);
  assert.equal(out[0].pending, 1.2);
  assert.deepEqual(out[0].starts.map((x) => x.pts), [3.3, 3.3]);
  assert.equal(out[1], rows[1]); // b's 5 matches nothing: untouched
  assert.equal(applyPending(rows, null), rows);
});

test("applyPendingToLineup: each lineup player gets his pending points and the lineup total says how many were added", () => {
  const lineup = [
    { id: "a", name: "Christian McCaffrey", pts: 18.1, slot: "RB" },
    { id: "b", name: "Jayden Daniels", pts: 4.2, slot: "QB" },
    { id: "c", name: "Nobody", pts: 3, slot: "WR" },
    { id: null, slot: "FLEX" },
  ];
  // McCaffrey: plays total 24.2, Sleeper 18.1 = the first 3 plays, so 6.1 pending. Daniels: caught up. Nobody: no plays known.
  const totals = { a: [10, 5, 3.1, 6.1], b: [1.1, 3.1] };
  const out = applyPendingToLineup(lineup, totals);
  assert.equal(out.list[0].pts, 24.2);
  assert.equal(out.list[0].pending, 6.1);
  assert.equal(out.list[1], lineup[1]);
  assert.equal(out.list[2], lineup[2]);
  assert.equal(out.added, 6.1);
  assert.equal(applyPendingToLineup(lineup, null).list, lineup);
});

test("adjustedMatchup: pending plays move the lineups, the totals and the win chance together; nothing pending hands back the server's numbers", () => {
  const gs = { SF: { state: "in", period: 3, clock: "0:15", detail: "0:15 - 3rd" }, GB: { state: "post", detail: "Final" } };
  const p = (id, name, team, pts, proj = 20) => ({ id, name, pos: "RB", team, slot: "RB", proj, floor: 8, ceiling: 36, pts });
  const settings = {
    winChance: 0.58,
    matchupActual: { mine: 87.52, opp: 96.68 },
    h2h: { mine: [p("a", "Christian McCaffrey", "SF", 27.1), p("b", "Done Guy", "GB", 60.42, 10)], opp: [p("z", "Opp Guy", "GB", 96.68, 10)] },
  };
  // Nothing pending: the server's win chance and Sleeper's totals come back as they are.
  const plain = adjustedMatchup(settings, gs, { a: [10, 5, 7.1, 5] });
  assert.equal(plain.winChance, 0.58);
  assert.deepEqual(plain.live, { mine: 87.52, opp: 96.68 });
  assert.deepEqual(plain.added, { mine: 0, opp: 0 });
  // McCaffrey's plays total 29.1 but Sleeper has 27.1: +2.0 pending -> totals, lineup and win chance move.
  const adj = adjustedMatchup(settings, gs, { a: [10, 5, 7.1, 5, 2] });
  assert.deepEqual(adj.added, { mine: 2, opp: 0 });
  assert.deepEqual(adj.live, { mine: 89.52, opp: 96.68 });
  assert.equal(adj.mine.pts, 89.52);
  assert.ok(adj.winChance > 0.58, "a higher score cannot lower the win chance");
  assert.equal(adjustedMatchup({ bestBall: true, winChance: null }, gs, null), null);
});

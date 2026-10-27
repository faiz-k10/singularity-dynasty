import { test } from "node:test";
import assert from "node:assert/strict";
import { acquiredMap, draftEvents, transactionEvents } from "../lib/acquisition.js";

test("transactionEvents: completed trades, waivers and free-agent adds only, one event per added player", () => {
  const ev = transactionEvents([
    { type: "trade", status: "complete", status_updated: 5, adds: { 100: 3, 200: 4 } },
    { type: "waiver", status: "failed", adds: { 300: 3 } },
    { type: "waiver", status: "complete", created: 7, adds: { 400: 3 } },
    { type: "free_agent", status: "complete", created: 8, adds: { 500: 3 } },
    { type: "commissioner", status: "complete", created: 9, adds: { 600: 3 } },
  ]);
  assert.deepEqual(ev.map((e) => [e.playerId, e.how, e.rosterId, e.t]), [
    ["100", "traded", 3, 5],
    ["200", "traded", 4, 5],
    ["400", "pickup", 3, 7],
    ["500", "pickup", 3, 8],
  ]);
});

test("draftEvents: picks with a player, stamped when the draft finished", () => {
  const ev = draftEvents({ last_picked: 50, start_time: 10 }, [{ player_id: "9", roster_id: 2 }, { player_id: null, roster_id: 2 }]);
  assert.deepEqual(ev, [{ t: 50, how: "drafted", playerId: "9", rosterId: 2 }]);
});

test("acquiredMap: the latest move onto THIS roster wins", () => {
  const events = [
    { t: 1, how: "drafted", playerId: "7", rosterId: 3 },
    { t: 5, how: "pickup", playerId: "7", rosterId: 3 }, // dropped, then picked back up
    { t: 2, how: "drafted", playerId: "8", rosterId: 4 },
    { t: 6, how: "traded", playerId: "8", rosterId: 3 }, // drafted by someone else, traded to us
    { t: 3, how: "traded", playerId: "9", rosterId: 4 }, // not ours
  ];
  assert.deepEqual(acquiredMap(events, 3), { 7: "pickup", 8: "traded" });
});

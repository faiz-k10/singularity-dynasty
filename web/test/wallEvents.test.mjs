import test from "node:test";
import assert from "node:assert/strict";
import { cleanWallEvent } from "../lib/wallEvents.js";

test("a good event keeps type, wall and the path only", () => {
  assert.deepEqual(cleanWallEvent({ type: "view", wall: "weekly-rankings", page: "/tools/redraft-rankings?name=x#top" }), {
    type: "view",
    wall: "weekly-rankings",
    page: "/tools/redraft-rankings",
  });
  assert.equal(cleanWallEvent({ type: "click", wall: "nav", page: "/" }).type, "click");
});

test("anything off is dropped", () => {
  assert.equal(cleanWallEvent(null), null);
  assert.equal(cleanWallEvent("x"), null);
  assert.equal(cleanWallEvent({ type: "hover", wall: "nav", page: "/" }), null);
  assert.equal(cleanWallEvent({ type: "view", wall: "Bad Wall", page: "/" }), null);
  assert.equal(cleanWallEvent({ type: "view", wall: "<script>", page: "/" }), null);
  assert.equal(cleanWallEvent({ type: "view", wall: "a".repeat(41), page: "/" }), null);
  assert.equal(cleanWallEvent({ type: "view", wall: "nav", page: "https://evil.example/" }), null);
  assert.equal(cleanWallEvent({ type: "view", wall: "nav" }), null);
});

test("a long path is cut", () => {
  assert.equal(cleanWallEvent({ type: "view", wall: "nav", page: "/" + "a".repeat(200) }).page.length, 80);
});

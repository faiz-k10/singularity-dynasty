import test from "node:test";
import assert from "node:assert/strict";
import { allowHit, clientIp } from "../lib/rateLimit.js";

test("allowHit caps hits per key in the window, keys are separate, old hits age out", () => {
  const hits = new Map();
  for (let i = 0; i < 3; i++) assert.ok(allowHit(hits, "1.2.3.4", 1000 + i, 3, 60000));
  assert.equal(allowHit(hits, "1.2.3.4", 2000, 3, 60000), false);
  assert.ok(allowHit(hits, "5.6.7.8", 2000, 3, 60000));
  assert.ok(allowHit(hits, "1.2.3.4", 1000 + 60001, 3, 60000));
});

test("allowHit drops idle keys once the map is large", () => {
  const hits = new Map();
  for (let i = 0; i < 5001; i++) hits.set("k" + i, [0]);
  allowHit(hits, "new", 120000, 3, 60000);
  assert.equal(hits.size, 1);
});

test("clientIp takes the first forwarded address", () => {
  const h = (o) => ({ get: (k) => o[k] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientIp(h({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientIp(h({})), "local");
});

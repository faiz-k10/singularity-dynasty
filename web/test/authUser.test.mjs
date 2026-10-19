import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthUser } from "../lib/authUser.js";

const fake = (result) => ({ auth: { getClaims: async () => result } });

test("getAuthUser: the signed-in user's id and email come from the verified JWT claims", async () => {
  const u = await getAuthUser(fake({ data: { claims: { sub: "abc-123", email: "me@example.com", exp: 9999999999 } }, error: null }));
  assert.deepEqual(u, { id: "abc-123", email: "me@example.com" });
});

test("getAuthUser: no session, a bad token or missing claims is signed out", async () => {
  assert.equal(await getAuthUser(fake({ data: null, error: null })), null);
  assert.equal(await getAuthUser(fake({ data: null, error: new Error("bad jwt") })), null);
  assert.equal(await getAuthUser(fake({ data: { claims: {} }, error: null })), null);
  assert.deepEqual(await getAuthUser(fake({ data: { claims: { sub: "x" } }, error: null })), { id: "x", email: null });
});

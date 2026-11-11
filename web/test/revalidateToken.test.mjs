import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { revalidateToken } from "../lib/revalidateToken.js";

test("the site's refresh token matches the one scripts/weekly-run.mjs sends", () => {
  const key = "example-service-key";
  assert.equal(revalidateToken(key), createHmac("sha256", key).update("revalidate:model-data:v1").digest("hex"));
  assert.equal(revalidateToken(""), null);
});

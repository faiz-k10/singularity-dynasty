import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorCode, safeNext, AUTH_ERRORS } from "../lib/authMessages.js";

test("authErrorCode: Supabase errors map to fixed messages", () => {
  assert.equal(authErrorCode({ code: "invalid_credentials", message: "Invalid login credentials" }), "credentials");
  assert.equal(authErrorCode({ message: "Email not confirmed" }), "unconfirmed");
  assert.equal(authErrorCode({ code: "weak_password" }), "weak-password");
  assert.equal(authErrorCode({ code: "over_email_send_rate_limit" }), "rate-limit");
  assert.equal(authErrorCode({ message: "For security purposes, you can only request this after 30 seconds." }), "rate-limit");
  assert.equal(authErrorCode({ message: "something new" }), "unknown");
  for (const c of ["credentials", "unconfirmed", "weak-password", "rate-limit", "unknown"]) assert.ok(AUTH_ERRORS[c]);
});

test("safeNext: same-site paths only", () => {
  assert.equal(safeNext("/my-team"), "/my-team");
  assert.equal(safeNext("/#pricing"), "/#pricing");
  assert.equal(safeNext("//evil.com"), "");
  assert.equal(safeNext("https://evil.com"), "");
  assert.equal(safeNext("/\\evil.com"), "");
  assert.equal(safeNext(null), "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCode, isReferralCode, rewardFor, referralApplies, REWARD_CENTS } from "../lib/referralRules.js";

test("referral codes: 8 unambiguous characters, and only those pass", () => {
  const code = makeCode(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253, 9, 9]));
  assert.equal(code.length, 8);
  assert.ok(isReferralCode(code), code);
  for (let i = 0; i < 200; i++) assert.ok(isReferralCode(makeCode(crypto.getRandomValues(new Uint8Array(8)))));
  for (const bad of ["", "ABCDEFGH", "abcdefg", "abcdefghi", "abcdefg0", "abcdefgl", "abc$efgh", null, 12345678]) assert.equal(isReferralCode(bad), false, String(bad));
});

test("rewardFor: a month of the referrer's plan, Explorer for free members", () => {
  assert.equal(rewardFor("singularity"), REWARD_CENTS.singularity);
  assert.equal(rewardFor("explorer"), REWARD_CENTS.explorer);
  assert.equal(rewardFor("stargazer"), REWARD_CENTS.explorer);
});

test("referralApplies: different person, first subscription only", () => {
  assert.equal(referralApplies({ referrerId: "a", userId: "b", subscribedBefore: false }), true);
  assert.equal(referralApplies({ referrerId: "a", userId: "a", subscribedBefore: false }), false, "self-referral");
  assert.equal(referralApplies({ referrerId: "a", userId: "b", subscribedBefore: true }), false, "returning subscriber");
  assert.equal(referralApplies({ referrerId: null, userId: "b", subscribedBefore: false }), false);
});

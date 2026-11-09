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

test("rewardDecision: the reward waits out the refund window and never pays a refund, an ended plan or the referrer's own card", async () => {
  const { rewardDecision, REWARD_HOLD_DAYS } = await import("../lib/referralRules.js");
  const now = Date.UTC(2026, 10, 30);
  const day = 86_400;
  const t = now / 1000;
  const charge = (ageDays, extra = {}) => ({ paid: true, status: "succeeded", refunded: false, amountRefunded: 0, created: t - ageDays * day, fingerprint: "friend", ...extra });
  const sub = (status = "active", referrerId = "R") => ({ status, referrerId });
  const base = { now, referrerId: "R", referrerCards: new Set(["mine"]) };
  assert.equal(rewardDecision({ ...base, sub: null, charges: [] }), "wait");
  assert.equal(rewardDecision({ ...base, sub: sub(), charges: [charge(1)] }), "wait");
  assert.equal(rewardDecision({ ...base, sub: sub(), charges: [charge(REWARD_HOLD_DAYS + 1)] }), "pay");
  assert.equal(rewardDecision({ ...base, sub: sub(), charges: [charge(20, { refunded: true, amountRefunded: 720 })] }), "void");
  assert.equal(rewardDecision({ ...base, sub: sub("canceled"), charges: [charge(20)] }), "void");
  assert.equal(rewardDecision({ ...base, sub: sub("active", "someone-else"), charges: [charge(20)] }), "void");
  assert.equal(rewardDecision({ ...base, sub: sub(), charges: [charge(20, { fingerprint: "mine" })] }), "void");
  assert.equal(rewardDecision({ ...base, sub: sub("incomplete"), charges: [] }), "wait");
});

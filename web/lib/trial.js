import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSleeperUser } from "@/lib/sleeper";
import { TRIAL_DAYS, TRIAL_TIER } from "@/lib/tierLimits";

// The 14-day Explorer trial, ONE PER SLEEPER ACCOUNT (founder, Nov 22 2026). A Sleeper username is required to sign up, and the trial starts
// right then (startTrial, from app/login/actions.js signup) -- not with the first saved league, or an account could sit on a trial-less
// free plan forever without saving one. The Sleeper account is recorded in `trial_claims` (migration 0049) by Sleeper's permanent user id, so
// renaming the username doesn't free it, and the row outlives a deleted account. Known limit: a Sleeper username is public and nobody proves
// they own it, so a determined person can type in someone else's; this stops the easy repeat with the same Sleeper account.
// Neither function throws: a failure means no trial, never a broken sign-up or save.

const iso = (ms) => new Date(ms).toISOString();

// At sign-up, with the Sleeper user already looked up (it must exist). -> { trial: "started" } | { trial: "used" } | {}
export async function startTrial(userId, sleeper, now = Date.now()) {
  try {
    const admin = createAdminClient();
    const sid = String(sleeper.user_id);
    const name = sleeper.username || sleeper.display_name || null;
    const profile = { sleeper_user_id: sid, sleeper_username: name };
    const { error: insErr } = await admin.from("trial_claims").insert({ sleeper_user_id: sid, sleeper_username: name, user_id: userId });
    if (insErr) {
      // 23505: that Sleeper account already had its trial (on any account, past or present): this account starts on Stargazer.
      await admin.from("profiles").update(profile).eq("id", userId);
      if (insErr.code === "23505") return { trial: "used" };
      console.error("[trial] claim failed:", insErr.message); // e.g. migration 0049 not run yet: no trial
      return {};
    }
    const { error } = await admin
      .from("profiles")
      .update({ ...profile, bonus_tier: TRIAL_TIER, bonus_until: iso(now + TRIAL_DAYS * 86_400_000), trial_started_at: iso(now) })
      .eq("id", userId)
      .is("trial_started_at", null);
    if (error) {
      console.error("[trial] start failed:", error.message);
      return {};
    }
    return { trial: "started" };
  } catch (e) {
    console.error("[trial]", e?.message || e);
    return {};
  }
}

// After a league is saved (app/my-team/actions.js saveTeam): during a running trial, a league from a Sleeper account that ANOTHER account
// already trialled ends this trial at once (signing up with a fresh Sleeper name and then saving the old one's leagues); a new Sleeper account
// is recorded as part of this trial, so it can't be reused either. -> { trial: "ended" } | {}
export async function guardTrial(userId, sleeperUsername, now = Date.now()) {
  try {
    const admin = createAdminClient();
    const { data: prof, error } = await admin.from("profiles").select("tier, bonus_tier, bonus_until, trial_started_at").eq("id", userId).maybeSingle();
    const onTrial = !error && prof?.tier === "stargazer" && prof.trial_started_at && prof.bonus_tier === TRIAL_TIER && Date.parse(prof.bonus_until) > now;
    if (!onTrial) return {};
    const sleeper = await fetchSleeperUser(String(sleeperUsername || "").trim());
    if (!sleeper?.user_id) return {};
    const sid = String(sleeper.user_id);
    const { data: claim } = await admin.from("trial_claims").select("user_id").eq("sleeper_user_id", sid).maybeSingle();
    if (claim && claim.user_id !== userId) {
      await admin.from("profiles").update({ bonus_until: iso(now) }).eq("id", userId);
      return { trial: "ended" };
    }
    if (!claim) await admin.from("trial_claims").insert({ sleeper_user_id: sid, sleeper_username: sleeper.username || sleeperUsername, user_id: userId });
    return {};
  } catch (e) {
    console.error("[trial]", e?.message || e);
    return {};
  }
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSleeperUser } from "@/lib/sleeper";
import { TRIAL_DAYS, TRIAL_TIER } from "@/lib/tierLimits";

// The 14-day Explorer trial, ONE PER SLEEPER ACCOUNT (founder, Nov 22 2026: a fresh email must not get a fresh trial for the same Sleeper
// username). It starts when an account saves its first league -- that is when we know whose Sleeper account it is -- and the Sleeper
// account is recorded in `trial_claims` (migration 0049) by Sleeper's permanent user id, so renaming the username doesn't free it.
// Called after every league save (actions.js saveTeam). Answers:
//   { trial: "started", until }   this save started the account's trial
//   { trial: "used" }             that Sleeper account already had a trial on another account: none here
//   { trial: "ended" }            a running trial ended, because this save brought in a Sleeper account another account's trial used
//   {}                            nothing to do (paid plan, trial already used, migration not run yet, Sleeper unreachable)
// Never throws: a failure means no trial, never a broken save. Known limit: a Sleeper username is public and nobody proves they own it, so a
// determined person can type in someone else's; this stops the easy repeat with the same Sleeper account.
export async function claimTrial(userId, sleeperUsername, now = Date.now()) {
  try {
    const admin = createAdminClient();
    const { data: prof, error } = await admin.from("profiles").select("tier, bonus_tier, bonus_until, trial_started_at").eq("id", userId).maybeSingle();
    if (error || !prof || prof.tier !== "stargazer") return {}; // a column missing (0049 not run) also lands here: no trial yet
    const sleeper = await fetchSleeperUser(String(sleeperUsername || "").trim());
    if (!sleeper?.user_id) return {};
    const sid = String(sleeper.user_id);

    const { data: claim } = await admin.from("trial_claims").select("user_id").eq("sleeper_user_id", sid).maybeSingle();
    const takenByOther = claim && claim.user_id !== userId;
    const onTrial = prof.trial_started_at && prof.bonus_tier === TRIAL_TIER && Date.parse(prof.bonus_until) > now;

    if (!prof.trial_started_at) {
      if (takenByOther) return { trial: "used" };
      // Take the Sleeper account first; if another account got it a moment earlier (a race), no trial.
      if (!claim) {
        const { error: insErr } = await admin.from("trial_claims").insert({ sleeper_user_id: sid, sleeper_username: sleeper.username || sleeperUsername, user_id: userId });
        if (insErr) return insErr.code === "23505" ? { trial: "used" } : {};
      }
      // Keep a longer bonus already running (a Night Sky reward), else 14 days from now.
      const fresh = now + TRIAL_DAYS * 86_400_000;
      const keep = prof.bonus_tier === TRIAL_TIER && Date.parse(prof.bonus_until) > fresh ? prof.bonus_until : new Date(fresh).toISOString();
      const { error: upErr } = await admin
        .from("profiles")
        .update({ bonus_tier: TRIAL_TIER, bonus_until: keep, trial_started_at: new Date(now).toISOString() })
        .eq("id", userId)
        .is("trial_started_at", null);
      if (upErr) return {};
      return { trial: "started", until: keep };
    }

    if (onTrial) {
      // A Sleeper account another trial already used: this trial ends now (it was a repeat). Otherwise record it as part of this trial.
      if (takenByOther) {
        await admin.from("profiles").update({ bonus_until: new Date(now).toISOString() }).eq("id", userId);
        return { trial: "ended" };
      }
      if (!claim) await admin.from("trial_claims").insert({ sleeper_user_id: sid, sleeper_username: sleeper.username || sleeperUsername, user_id: userId });
    }
    return {};
  } catch (e) {
    console.error("[trial]", e?.message || e);
    return {};
  }
}

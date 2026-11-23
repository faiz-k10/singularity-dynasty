"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorCode, safeNext } from "@/lib/authMessages";
import { siteOrigin } from "@/lib/siteOrigin";
import { cookies, headers } from "next/headers";
import { allowHit, clientIp } from "@/lib/rateLimit";
import { recordReferral } from "@/lib/referrals";
import { addSubscriber } from "@/lib/emailList";
import { startTrial } from "@/lib/trial";
import { fetchSleeperUser } from "@/lib/sleeper";
import { REF_COOKIE } from "@/lib/referralRules";
import { TURNSTILE_FIELD, tooFast } from "@/lib/turnstile";

const MIN_PASSWORD = 8;

// Back to the sign-in page with a fixed message code (lib/authMessages.js), keeping where the visitor was headed.
function back(path, key, code, next) {
  redirect(`${path}?${key}=${code}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
}

function fields(formData) {
  const email = String(formData.get("email") || "").trim().slice(0, 254);
  const password = String(formData.get("password") || "").slice(0, 200);
  return { email, password, next: safeNext(formData.get("next")) };
}

// Anti-bot (Nov 16 2026): the Turnstile token goes to Supabase Auth (it checks it once captcha is on in the Supabase dashboard);
// a filled honeypot or a form sent faster than a person types is treated as a bot and quietly gets the normal answer.
const captcha = (formData) => {
  const t = String(formData.get(TURNSTILE_FIELD) || "");
  return t ? { captchaToken: t } : {};
};
const isBot = (formData) => Boolean(formData.get("website")) || tooFast(formData.get("t"));

// Attempt limits (security pass, Nov 16 2026). These calls reach Supabase from OUR server, so Supabase's own per-address limits see
// Vercel's addresses, not the visitor's: without these, one person could guess passwords against an account, or use the reset form to
// flood someone's inbox. Per address AND per email, per server instance (lib/rateLimit.js). Wait times are in AUTH_ERRORS["rate-limit"].
const MIN = 60_000;
const LIMITS = {
  login: [new Map(), 20, 10 * MIN, new Map(), 8, 15 * MIN],
  signup: [new Map(), 6, 60 * MIN, new Map(), 3, 60 * MIN],
  reset: [new Map(), 6, 60 * MIN, new Map(), 3, 60 * MIN],
};
async function overLimit(kind, email) {
  const [byIp, ipMax, ipWin, byEmail, emailMax, emailWin] = LIMITS[kind];
  const now = Date.now();
  const ipOk = allowHit(byIp, clientIp(await headers()), now, ipMax, ipWin);
  const emailOk = allowHit(byEmail, email.toLowerCase(), now, emailMax, emailWin);
  return !ipOk || !emailOk;
}

export async function login(formData) {
  const { email, password, next } = fields(formData);
  if (!email || !password) back("/login", "error", "missing-fields", next);
  if (await overLimit("login", email)) back("/login", "error", "rate-limit", next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: captcha(formData) });
  if (error) back("/login", "error", authErrorCode(error), next);
  revalidatePath("/", "layout");
  redirect(next || "/my-team");
}

export async function signup(formData) {
  const { email, password, next } = fields(formData);
  if (!email || !password) back("/login", "error", "missing-fields", next);
  if (password.length < MIN_PASSWORD) back("/login", "error", "weak-password", next);
  if (isBot(formData)) back("/login", "message", "check-email", next);
  if (await overLimit("signup", email)) back("/login", "error", "rate-limit", next);
  // A Sleeper username is required to sign up (founder, Nov 22 2026): the 14-day Explorer trial starts now and belongs to that Sleeper
  // account, one trial per Sleeper account (lib/trial.js). It must be a real Sleeper account; checked before the account is made.
  const sleeperName = String(formData.get("sleeper") || "").trim().slice(0, 40);
  if (!sleeperName) back("/login", "error", "missing-sleeper", next);
  const sleeper = await fetchSleeperUser(sleeperName).catch(() => null);
  if (!sleeper?.user_id) back("/login", "error", "sleeper-not-found", next);
  const supabase = await createClient();
  // The confirmation email links to /auth/confirm, which signs the new account in and continues to `next`.
  const confirm = `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next || "/my-team?welcome=1")}`;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirm, ...captcha(formData) } });
  if (error) back("/login", "error", authErrorCode(error), next);
  // Came through a friend's link? Record it now (a brand-new account only: Supabase answers an existing email with a user
  // that has no identities, so it can't be claimed by someone typing another person's address).
  const ref = (await cookies()).get(REF_COOKIE)?.value;
  const isNew = Boolean(data?.user?.id && data.user.identities?.length);
  if (ref && isNew) await recordReferral(data.user.id, ref);
  if (isNew) {
    // Unless the box was unticked, a new account joins the Tuesday newsletter (founder, Nov 22 2026). Neither can stop the sign-up.
    if (formData.get("newsletter") === "on") await addSubscriber(email, "signup").catch((e) => console.error("[signup] newsletter:", e?.message || e));
    const trial = await startTrial(data.user.id, sleeper);
    if (trial.trial === "used") back("/login", "message", "check-email-trial-used", next);
  }
  back("/login", "message", "check-email", next);
}

// "Forgot password": always answers the same way, so the form can't be used to find out which emails have accounts.
export async function requestPasswordReset(formData) {
  const { email } = fields(formData);
  if (!email) back("/login/reset", "error", "missing-fields");
  if (isBot(formData)) back("/login", "message", "reset-sent");
  if (await overLimit("reset", email)) back("/login/reset", "error", "rate-limit");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/account/password")}`,
    ...captcha(formData),
  });
  if (error && authErrorCode(error) === "captcha") back("/login/reset", "error", "captcha");
  if (error && authErrorCode(error) === "rate-limit") back("/login/reset", "error", "rate-limit");
  back("/login", "message", "reset-sent");
}

// Sets a new password for the signed-in account (after the reset link, or from the account page).
export async function updatePassword(formData) {
  const password = String(formData.get("password") || "").slice(0, 200);
  const confirm = String(formData.get("confirm") || "").slice(0, 200);
  if (password.length < MIN_PASSWORD) back("/account/password", "error", "weak-password");
  if (password !== confirm) back("/account/password", "error", "passwords-differ");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) back("/login/reset", "error", "reset-needs-session");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("/account/password", "error", authErrorCode(error));
  redirect("/account?notice=password-updated");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?message=signed-out");
}

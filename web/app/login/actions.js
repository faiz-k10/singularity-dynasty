"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorCode, safeNext } from "@/lib/authMessages";
import { siteOrigin } from "@/lib/siteOrigin";

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

export async function login(formData) {
  const { email, password, next } = fields(formData);
  if (!email || !password) back("/login", "error", "missing-fields", next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) back("/login", "error", authErrorCode(error), next);
  revalidatePath("/", "layout");
  redirect(next || "/account");
}

export async function signup(formData) {
  const { email, password, next } = fields(formData);
  if (!email || !password) back("/login", "error", "missing-fields", next);
  if (password.length < MIN_PASSWORD) back("/login", "error", "weak-password", next);
  const supabase = await createClient();
  // The confirmation email links to /auth/confirm, which signs the new account in and continues to `next`.
  const confirm = `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next || "/account?notice=confirmed")}`;
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirm } });
  if (error) back("/login", "error", authErrorCode(error), next);
  back("/login", "message", "check-email", next);
}

// "Forgot password": always answers the same way, so the form can't be used to find out which emails have accounts.
export async function requestPasswordReset(formData) {
  const { email } = fields(formData);
  if (!email) back("/login/reset", "error", "missing-fields");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/account/password")}`,
  });
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

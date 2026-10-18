"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Only same-site paths ("/my-team"), never an absolute or protocol-relative URL.
function safeNext(value) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "";
}

export async function login(formData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  revalidatePath("/", "layout");
  redirect(next || "/account");
}

export async function signup(formData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/login?message=${encodeURIComponent(
      "Check your email to confirm your account, then sign in."
    )}${next ? `&next=${encodeURIComponent(next)}` : ""}`
  );
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/emailRules";

// The newsletter list (table `subscribers`, migration 0043; service role only). Adding an address that is already on the
// list changes nothing; adding one that unsubscribed earlier re-subscribes it (the person typed it in again themselves).
// Throws only on a database error.
export async function addSubscriber(rawEmail, source) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "invalid" };
  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin.from("subscribers").select("id, unsubscribed_at").eq("email", email).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) {
    if (existing.unsubscribed_at) await admin.from("subscribers").update({ unsubscribed_at: null, source: String(source || "").slice(0, 40) || null }).eq("id", existing.id);
    return { ok: true };
  }
  const { error } = await admin.from("subscribers").insert({ email, source: String(source || "").slice(0, 40) || null, token: randomBytes(18).toString("hex") });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505 = added by a parallel request
  return { ok: true };
}

// The unsubscribe link's token -> the address (masked for display) and whether it's still subscribed.
export async function subscriberByToken(token) {
  if (!/^[0-9a-f]{36}$/.test(String(token || ""))) return null;
  const { data } = await createAdminClient().from("subscribers").select("email, unsubscribed_at").eq("token", token).maybeSingle();
  return data || null;
}

export async function unsubscribe(token) {
  if (!/^[0-9a-f]{36}$/.test(String(token || ""))) return false;
  const { data } = await createAdminClient().from("subscribers").update({ unsubscribed_at: new Date().toISOString() }).eq("token", token).is("unsubscribed_at", null).select("id");
  return Boolean(data?.length);
}

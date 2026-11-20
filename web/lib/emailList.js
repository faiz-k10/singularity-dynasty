import "server-only"; // holds a secret key: the build fails if a browser component ever imports this
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/emailRules";

// The newsletter list (table `subscribers`, migration 0043; service role only). Adding an address that is already on the
// list changes nothing; adding one that unsubscribed earlier re-subscribes it (the person typed it in again themselves).
// Throws only on a database error.
//
// `extra` = the quiz's { first_name, last_name, archetype, quiz } (already cleaned by the caller). Until migration 0047 adds those
// columns the row is saved without them (the address is what matters).
export async function addSubscriber(rawEmail, source, extra = null) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "invalid" };
  const admin = createAdminClient();
  const withExtra = async (write) => {
    if (!extra) return write({});
    const res = await write(extra);
    return res.error?.code === "42703" || /column .* does not exist|schema cache/i.test(res.error?.message || "") ? write({}) : res;
  };
  const { data: existing, error: readErr } = await admin.from("subscribers").select("id, unsubscribed_at").eq("email", email).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) {
    // Re-subscribing (they typed it in again) takes the new name / quiz; an address already on the list only gets a name if it
    // has none yet, so nobody can rename someone else's entry by typing their email.
    const update = (x) => {
      const p = existing.unsubscribed_at ? { unsubscribed_at: null, source: String(source || "").slice(0, 40) || null, ...x } : x;
      if (!Object.keys(p).length) return { error: null };
      const q = admin.from("subscribers").update(p).eq("id", existing.id);
      return existing.unsubscribed_at ? q : q.is("first_name", null);
    };
    if (existing.unsubscribed_at || extra) {
      const { error } = await withExtra(update);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  }
  const row = { email, source: String(source || "").slice(0, 40) || null, token: randomBytes(18).toString("hex") };
  const { error } = await withExtra((x) => admin.from("subscribers").insert({ ...row, ...x }));
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

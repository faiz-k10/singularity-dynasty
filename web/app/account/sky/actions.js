"use server";

import { createClient } from "@/lib/supabase/server";
import { markSeen, makePick, claimReward, setSkin } from "@/lib/nightSkyStore";

// The Night Sky's three member actions. Each confirms the account (these change data, so getUser, not the local token check) and returns the
// updated sky, or { error }.
async function member() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
const guard = async (fn) => {
  const user = await member();
  if (!user) return { error: "Sign in first." };
  try {
    return { state: await fn(user.id) };
  } catch (e) {
    console.error("[night-sky]", e?.message || e);
    return { error: "Couldn't save that. Please try again." };
  }
};

export async function seeFinds(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 20);
  return guard((id) => markSeen(id, list));
}
export async function pickPlayer(key, index, choice) {
  return guard((id) => makePick(id, String(key).slice(0, 12), Number(index), Number(choice)));
}
export async function claim(at) {
  return guard((id) => claimReward(id, Number(at)));
}
export async function wearSkin(kind, id) {
  return guard((uid) => setSkin(uid, String(kind).slice(0, 8), String(id).slice(0, 20)));
}

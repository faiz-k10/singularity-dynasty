"use server";

import { createClient } from "@/lib/supabase/server";
import { awardAction } from "@/lib/nightSkyStore";

// The Night Sky's "use this tool" tasks (lib/nightSky.js ACTIONS). Called by SkyCredit only after a real interaction on the tool's page
// (founder, Nov 17 2026: "make sure tools are opened and interacted with before they are checked off"; the pages used to award on
// render, which a hover-prefetch from the Tools menu also triggers). The waiver-wire and share tasks are awarded by their own actions.
const PAGE_TASKS = new Set(["board", "rankings", "compare", "sims", "lab", "dynasty"]);

export async function creditSky(action) {
  if (!PAGE_TASKS.has(action)) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser(); // a write: the full check, not the local JWT read (CLAUDE.md, Performance notes)
  if (!data?.user) return { ok: false };
  const r = await awardAction(data.user.id, action);
  return { ok: !!r?.awarded };
}

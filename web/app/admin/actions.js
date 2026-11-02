"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { parseProspects, parseDraftBoard } from "@/lib/boardImport";

// /admin's publishing actions. Every one re-checks the founder (requireAdmin -> 404 for anyone else) before touching the
// database with the service role. Results come back as { ok, message, errors } for the form that called them.
const MAX_FILE = 2_000_000;

function done(message) {
  revalidatePath("/admin");
  revalidatePath("/", "layout"); // the home page's feed and the tool pages read these tables
  return { ok: true, message, errors: [] };
}
const fail = (...errors) => ({ ok: false, message: "", errors });

export async function addPost(_prev, formData) {
  await requireAdmin();
  const title = String(formData.get("title") || "").trim().slice(0, 200);
  const url = String(formData.get("url") || "").trim().slice(0, 500);
  if (!title) return fail("Give the drop a title.");
  if (url && !/^https:\/\/[^\s]+$/i.test(url) && !url.startsWith("/")) return fail("The link must start with https:// (or be a page on this site, starting with /).");
  const { error } = await createAdminClient().from("posts").insert({ title, url: url || "#" });
  if (error) return fail(error.message);
  return done(`Posted "${title}". It's on the home page now.`);
}

export async function deletePost(formData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await createAdminClient().from("posts").delete().eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

async function fileText(formData) {
  const f = formData.get("file");
  if (!f || typeof f === "string" || !f.size) return { error: "Choose a CSV file." };
  if (f.size > MAX_FILE) return { error: "That file is over 2 MB." };
  return { text: await f.text() };
}

// Replace one board: insert the new rows first, then remove the old ones, so a failed insert leaves the old board up.
async function replaceRows(table, match, rows) {
  const admin = createAdminClient();
  const { data: old, error: readErr } = await match(admin.from(table).select("id"));
  if (readErr) return readErr.message;
  const { error: insErr } = await admin.from(table).insert(rows);
  if (insErr) return insErr.message;
  const ids = (old || []).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await admin.from(table).delete().in("id", ids.slice(i, i + 500));
    if (error) return `New rows are in, but removing the old ones failed: ${error.message}`;
  }
  return null;
}

export async function uploadProspects(_prev, formData) {
  await requireAdmin();
  const draftClass = Number(formData.get("draft_class"));
  if (!Number.isInteger(draftClass) || draftClass < 2020 || draftClass > 2100) return fail("Pick a draft class year.");
  const { text, error } = await fileText(formData);
  if (error) return fail(error);
  const { rows, errors } = parseProspects(text);
  if (errors.length) return fail(...errors.slice(0, 20), ...(errors.length > 20 ? [`...and ${errors.length - 20} more.`] : []));
  const err = await replaceRows("prospect_rankings", (q) => q.eq("draft_class", draftClass), rows.map((r) => ({ ...r, draft_class: draftClass })));
  if (err) return fail(err);
  const wr = rows.filter((r) => r.position === "WR").length;
  return done(`Published the ${draftClass} prospect board: ${wr} WRs, ${rows.length - wr} QBs.`);
}

export async function uploadDraftBoard(_prev, formData) {
  await requireAdmin();
  const season = Number(formData.get("season"));
  const boardType = String(formData.get("board_type"));
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return fail("Pick a season.");
  if (!["startup", "rookie"].includes(boardType)) return fail("Pick Startup or Rookie.");
  const { text, error } = await fileText(formData);
  if (error) return fail(error);
  const { rows, errors } = parseDraftBoard(text);
  if (errors.length) return fail(...errors.slice(0, 20), ...(errors.length > 20 ? [`...and ${errors.length - 20} more.`] : []));
  const err = await replaceRows("draft_board", (q) => q.eq("season", season).eq("board_type", boardType), rows.map((r) => ({ ...r, season, board_type: boardType })));
  if (err) return fail(err);
  return done(`Published the ${season} ${boardType} board: ${rows.length} picks over ${new Set(rows.map((r) => r.round)).size} rounds.`);
}

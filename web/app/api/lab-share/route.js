import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHARE_BUCKET, SHARE_MAX_BYTES, shareId, cleanShareMeta, isPng } from "@/lib/labShare";
import { allowHit, clientIp } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/authUser";
import { withReferral } from "@/lib/referrals";

// Creates a shared chart from The Observatory (LabShare.js): the picture (a PNG, already drawn in the browser with the watermark) and its title, caption
// and Lab view go into the public "lab-shares" bucket as <id>.png + <id>.json, and the answer is the share page's address, /s/<id>, whose
// link preview is that picture. Open to every visitor of The Observatory, so it only takes a PNG of a sane size with a Lab link, and caps how many
// shares one address can make an hour (20; lib/rateLimit.js, per server instance). A signed-in member's link carries their referral code.
const hits = new Map();

export async function POST(request) {
  if (!allowHit(hits, clientIp(request.headers), Date.now(), 20, 60 * 60 * 1000)) return NextResponse.json({ error: "Too many shares for now. Try again in a little while." }, { status: 429 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const file = form.get("image");
  const meta = cleanShareMeta({ title: form.get("title"), caption: form.get("caption"), view: form.get("view") });
  if (!meta || !file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (file.size > SHARE_MAX_BYTES) return NextResponse.json({ error: "That picture is too large to share." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPng(bytes)) return NextResponse.json({ error: "Invalid picture." }, { status: 400 });

  const id = shareId(randomBytes(10));
  const storage = createAdminClient().storage.from(SHARE_BUCKET);
  const [img, json] = await Promise.all([
    storage.upload(`${id}.png`, bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false }),
    storage.upload(`${id}.json`, JSON.stringify({ ...meta, created: new Date().toISOString() }), { contentType: "application/json", cacheControl: "31536000", upsert: false }),
  ]);
  if (img.error || json.error) {
    console.error("[lab-share] upload failed:", img.error?.message || json.error?.message);
    return NextResponse.json({ error: "Couldn't create the share link. Try again." }, { status: 500 });
  }
  const user = await getAuthUser(await createClient()).catch(() => null);
  return NextResponse.json({ id, url: await withReferral(`${new URL(request.url).origin}/s/${id}`, user?.id) });
}

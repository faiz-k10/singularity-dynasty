import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tier";
import { PAID_TIERS } from "@/app/tools/redraft-rankings/data";
import { signCard } from "@/lib/cardToken";
import { cardSecret, latestWeek, canCardPlayer, canCardDynasty, cardFromToken, parseWeekSlug, weekSlug, latestReceiptsWeek, receiptsFor, smashFor } from "@/lib/cardData";
import { receiptsWords } from "@/lib/receipts";
import { smashWords } from "@/lib/smashSpots";
import { withReferral } from "@/lib/referrals";
import { allowHit, clientIp } from "@/lib/rateLimit";
import { awardLater } from "@/lib/nightSkyStore";

// Makes a share link (ShareCardButton.js). Player, dynasty and start / sit cards get a SIGNED link (/c/<token>, lib/cardToken.js), and only for
// players the viewer may see on that tool (Weekly Projection Rankings: everyone ranked for Explorer+, the top 50 otherwise; the Dynasty Draft
// Board: everyone for Explorer+, the free 20 otherwise) -- so the public card pages never show a player the paywall protects unless a member
// chose to share him. Receipts and Smash Spots are public pages already. A signed-in member's link carries their referral code.
// Answers { url, image, tall, caption }: the page to post, its wide picture (1200 x 630), the Instagram one (1080 x 1350) and a post caption.
const hits = new Map();
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return bad("Invalid request.", 403);
  if (!allowHit(hits, clientIp(request.headers), Date.now(), 60, 10 * 60_000)) return bad("Too many cards for now. Try again in a few minutes.", 429);
  let body;
  try {
    body = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return bad("Invalid request.");
  }

  const supabase = await createClient();
  const { user, tier } = await resolveTier(supabase);
  const full = PAID_TIERS.includes(tier);
  const site = request.nextUrl.origin;
  let path = null;
  let token = null;
  let caption = null;

  if (body.kind === "p" || body.kind === "s") {
    const latest = await latestWeek();
    if (!latest) return bad("No published week to share yet.", 404);
    const picks = body.kind === "p" ? [[body.name, body.pos]] : [body.a, body.b];
    if (!picks.every(Array.isArray)) return bad("Invalid request.");
    for (const [n, pos] of picks) if (!(await canCardPlayer(n, pos, full))) return bad("That player isn't on your plan's list.", 403);
    const card = body.kind === "p" ? { k: "p", s: latest.season, w: latest.week, n: body.name, pos: body.pos } : { k: "s", s: latest.season, w: latest.week, a: body.a, b: body.b };
    token = signCard(card, cardSecret());
  } else if (body.kind === "d") {
    if (!canCardDynasty(body.id, full)) return bad("That player isn't on your plan's board.", 403);
    token = signCard({ k: "d", id: body.id, f: body.f, m: body.m }, cardSecret());
  } else if (body.kind === "token") {
    token = body.token; // re-sharing a card someone else made: the same card, with this viewer's own referral code
  } else if (body.kind === "receipts" || body.kind === "smash") {
    const wk = parseWeekSlug(body.slug) || (body.kind === "receipts" ? await latestReceiptsWeek() : await latestWeek());
    const data = wk && (body.kind === "receipts" ? await receiptsFor(wk.season, wk.week) : await smashFor(wk.season, wk.week));
    if (!data) return bad("Nothing to share yet.", 404);
    path = `/${body.kind}/${weekSlug(wk)}`;
    caption = (body.kind === "receipts" ? receiptsWords(data) : smashWords(data)).caption;
  } else {
    return bad("Invalid request.");
  }
  if (!path) {
    const c = token && (await cardFromToken(token));
    if (!c) return bad("That card can't be made.", 404);
    path = `/c/${token}`;
    caption = c.caption;
  }

  const image = `${site}${path}/image`;
  awardLater(user?.id, "share"); // a Night Sky star, once a day (signed-in members only)
  return NextResponse.json({ url: await withReferral(`${site}${path}`, user?.id), image, tall: `${image}?f=tall`, caption });
}

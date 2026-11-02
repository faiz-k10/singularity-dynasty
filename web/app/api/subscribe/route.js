import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/emailList";
import { allowHit, clientIp } from "@/lib/rateLimit";

// The newsletter form (app/NewsletterForm.js). Same-site only, 5 sign-ups per address per 10 minutes, and a hidden "website"
// field that people never fill: a bot that fills it is told "ok" and nothing is saved.
const hits = new Map();
export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  let body = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return NextResponse.json({ ok: false, error: "Enter an email address." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true });
  if (!allowHit(hits, clientIp(await headers()), Date.now(), 5, 10 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many sign-ups from your connection. Try again in a few minutes." }, { status: 429 });
  }
  try {
    const res = await addSubscriber(body.email, body.source || "home");
    if (!res.ok) return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[subscribe]", e.message);
    return NextResponse.json({ ok: false, error: "Couldn't save that just now. Please try again." }, { status: 500 });
  }
}

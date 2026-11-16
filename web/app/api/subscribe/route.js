import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/emailList";
import { cleanName, cleanQuizAnswers } from "@/lib/emailRules";
import { GM_ARCHETYPE_QUESTIONS, scoreGmArchetype } from "@/lib/insights/gmArchetype";
import { allowHit, clientIp } from "@/lib/rateLimit";
import { tooFast, verifyTurnstile } from "@/lib/turnstile";

// The newsletter sign-up = the Dynasty Manager quiz (app/ManagerQuiz.js: first name, last name, email + the four questions). Anti-bot, in order: same-site only; a hidden "website" field people never fill and a form sent faster than a
// person can (both told "ok" and nothing is saved, so a bot learns nothing); 5 sign-ups per address per 10 minutes; Turnstile
// once its keys are set (lib/turnstile.js).
const hits = new Map();
export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  let body = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 4000));
  } catch {
    return NextResponse.json({ ok: false, error: "Enter an email address." }, { status: 400 });
  }
  if (body.website || tooFast(body.t)) return NextResponse.json({ ok: true });
  const ip = clientIp(await headers());
  if (!allowHit(hits, ip, Date.now(), 5, 10 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many sign-ups from your connection. Try again in a few minutes." }, { status: 429 });
  }
  // the quiz is the only way onto the list now (founder, Nov 16 2026): names + every question answered
  const first = cleanName(body.firstName);
  const last = cleanName(body.lastName);
  if (!first || !last) return NextResponse.json({ ok: false, error: "Enter your first and last name (letters only)." }, { status: 400 });
  const answers = cleanQuizAnswers(body.answers, GM_ARCHETYPE_QUESTIONS);
  if (!answers) return NextResponse.json({ ok: false, error: "Answer every question first." }, { status: 400 });
  const result = scoreGmArchetype(answers);
  const extra = { first_name: first, last_name: last, archetype: result.key, quiz: answers };
  if (!(await verifyTurnstile(body.captcha, ip))) {
    return NextResponse.json({ ok: false, error: "We couldn't confirm you're a person. Finish the check and try again." }, { status: 400 });
  }
  try {
    const res = await addSubscriber(body.email, String(body.source || "quiz").replace(/[^a-z-]/g, "").slice(0, 20) || "quiz", extra);
    if (!res.ok) return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
    return NextResponse.json({ ok: true, result: { label: result.label, blurb: result.blurb, key: result.key } });
  } catch (e) {
    console.error("[subscribe]", e.message);
    return NextResponse.json({ ok: false, error: "Couldn't save that just now. Please try again." }, { status: 500 });
  }
}

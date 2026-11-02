import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/authMessages";

// Where Supabase's email links land (sign-up confirmation, password reset): turns the link into a signed-in session and
// continues to `next`. Handles both link styles -- ?code= (the PKCE flow the server client uses; the code can only be
// exchanged in the browser that asked for it) and ?token_hash=&type= (an email template that links here directly).
// A link that can't be used goes to sign-in with the fixed "link-expired" message.
export async function GET(request) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next")) || (type === "recovery" ? "/account/password" : "/my-team");

  const supabase = await createClient();
  let error = true;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && ["signup", "email", "recovery", "email_change", "invite", "magiclink"].includes(type)) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  }

  const dest = new URL(error ? "/login?error=link-expired" : next, url.origin);
  return NextResponse.redirect(dest);
}

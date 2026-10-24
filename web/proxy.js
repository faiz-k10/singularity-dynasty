import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Refreshes the Supabase auth session cookie on every navigation so
// Server Components always see a valid (non-expired) session.
export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Reading the session (getClaims) is what triggers a token refresh when one is due -- and, unlike getUser(), it verifies the
  // JWT locally instead of calling Supabase's Auth server on EVERY navigation.
  const t0 = Date.now();
  await supabase.auth.getClaims();
  console.log(`[page] proxy ${request.nextUrl.pathname} getClaims=${Date.now() - t0}ms`);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};

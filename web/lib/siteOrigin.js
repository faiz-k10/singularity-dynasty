import { headers } from "next/headers";

// This site's own origin ("https://web-kohl-ten-94.vercel.app", "http://localhost:3000") for links that leave and come
// back -- Stripe's return URLs, Supabase's email links. Read from the request's Host; Supabase only follows links on its
// Redirect URLs allow-list, so a forged Host header can't send an email link anywhere else.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

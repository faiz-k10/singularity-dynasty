import { headers } from "next/headers";
import { originFor } from "./siteHosts.js";

// This site's own origin ("https://dynastysingularity.com", "http://localhost:3000") for links that leave and come back --
// Stripe's return URLs, Supabase's email links -- and for checking that a POST came from this site. Only known hosts
// (lib/siteHosts.js); anything else gets the canonical address.
export async function siteOrigin() {
  const h = await headers();
  return originFor(h.get("x-forwarded-host") || h.get("host"));
}

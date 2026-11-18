// Which addresses count as this site (pure; tested in test/rateLimit.test.mjs). lib/siteOrigin.js applies it to the request.
// Only these hosts are ever used for return links: any other Host header gets the canonical address, so no tampered request can
// make Stripe or an email link send someone to another site (security pass, Nov 17 2026).
export const CANONICAL = "https://dynastysingularity.com";
const SITE_HOSTS = new Set(["dynastysingularity.com", "www.dynastysingularity.com", "web-kohl-ten-94.vercel.app"]);
const isLocal = (host) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);

export function originFor(host) {
  const h = String(host || "").toLowerCase();
  if (isLocal(h)) return `http://${h}`;
  return SITE_HOSTS.has(h) ? `https://${h}` : CANONICAL;
}

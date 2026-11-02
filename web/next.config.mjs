/** @type {import('next').NextConfig} */
// Security headers on every response. No script-src rule on purpose: Next's inline bootstrap scripts would need per-request
// nonces (which turn every page dynamic); these cover the attacks that don't depend on that -- the site can't be framed
// (clickjacking the pricing / billing buttons), no MIME sniffing, no plugin objects, no <base> hijack, full URLs never
// leak to other sites, and browsers stay on https.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  poweredByHeader: false,
  // The share-card pictures (lib/cardArt.js) read their fonts and the team logos from disk; files in public/ aren't part of a server
  // function on their own, so they are traced in for those routes.
  outputFileTracingIncludes: {
    "/c/\\[token\\]/image": ["./assets/og-fonts/*.ttf", "./public/team-logos/*-dark.png"],
    "/receipts/\\[slug\\]/image": ["./assets/og-fonts/*.ttf"],
    "/smash/\\[slug\\]/image": ["./assets/og-fonts/*.ttf"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // Team logos never change (96px PNGs fetched once, own-site copies). Files in public/ otherwise get
        // `max-age=0, must-revalidate`, so every page view re-checked all ~32 logos with the server. A week in the
        // browser (and a month of stale-while-revalidate) takes those requests off the page load; if a logo is ever
        // replaced, change its file name.
        source: "/team-logos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
    ];
  },
};

export default nextConfig;

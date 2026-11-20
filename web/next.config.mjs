import { publicEnvProblems } from "./lib/secretGuard.mjs";

// A secret named NEXT_PUBLIC_* would be copied into the JavaScript every visitor downloads: refuse to build at all (lib/secretGuard.mjs).
const leaks = publicEnvProblems(process.env);
if (leaks.length) {
  throw new Error(`Refusing to build: ${leaks.map((l) => `${l.key} (${l.problem})`).join(", ")}. A NEXT_PUBLIC_ variable is sent to every visitor's browser -- rename it without NEXT_PUBLIC_ and read it only on the server.`);
}

// Security headers on every response. No script-src rule on purpose: Next's inline bootstrap scripts would need per-request
// nonces (which turn every page dynamic); these cover the attacks that don't depend on that -- the site can't be framed
// (clickjacking the pricing / billing buttons), no MIME sniffing, no plugin objects, no <base> hijack, full URLs never
// leak to other sites, and browsers stay on https.
const SECURITY_HEADERS = [
  // form-action: a form (even one injected into a page) can only post to this site, or move on to Stripe's own pages after a billing action.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com" },
  // another site that opens us in a pop-up can't reach back into our window (share pop-ups we open still work)
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
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

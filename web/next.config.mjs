/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
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

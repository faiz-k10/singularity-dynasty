const SITE_URL = "https://web-kohl-ten-94.vercel.app";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

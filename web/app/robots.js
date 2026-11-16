const SITE_URL = "https://dynastysingularity.com";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/api/", "/auth/", "/login/reset"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

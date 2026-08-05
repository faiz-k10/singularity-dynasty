const SITE_URL = "https://web-kohl-ten-94.vercel.app";

export default function sitemap() {
  const now = new Date();

  const marketing = [
    { url: "", changeFrequency: "weekly", priority: 1 },
    { url: "/login", changeFrequency: "monthly", priority: 0.3 },
  ];

  // Explorer+/Singularity-gated tools still get indexed — signed-out
  // visitors see a real teaser on each, not a login wall.
  const tools = [
    "redraft-rankings",
    "draft-board",
    "player-simulations",
    "prospect-rankings",
    "compare-players",
  ].map((slug) => ({
    url: `/tools/${slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const legal = ["privacy", "terms", "disclaimer", "contact"].map((slug) => ({
    url: `/${slug}`,
    changeFrequency: "yearly",
    priority: 0.2,
  }));

  return [...marketing, ...tools, ...legal].map((entry) => ({
    url: `${SITE_URL}${entry.url}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

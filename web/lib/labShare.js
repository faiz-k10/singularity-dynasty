// Shared charts from The Observatory (app/tools/lab/LabExport.js -> app/api/lab-share -> app/s/[id]). Each share is a picture of the chart and a small
// description file in the public Supabase Storage bucket below; its page, /s/<id>, carries the picture as its link preview, so posting the link
// on X, Threads, Bluesky, Facebook, LinkedIn, Reddit or Discord shows the chart itself. Pure; tested in test/labShare.test.mjs.

export const SHARE_BUCKET = "lab-shares";
export const SHARE_MAX_BYTES = 4 * 1024 * 1024;
// The preview shape the platforms use for a large link card (1.91 : 1); the chart is fitted inside it so no platform crops it.
export const SHARE_W = 2400;
export const SHARE_H = 1256;

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0 / O / 1 / l / I look-alikes

// A short random id from `bytes` (a Uint8Array of random bytes, one character each).
export function shareId(bytes) {
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const isShareId = (id) => typeof id === "string" && /^[a-zA-Z0-9]{10}$/.test(id);

// Where a share can come from, and what its page (/s/<id>) calls that place and links back to. The player dashboards were added on
// Nov 17 2026 (founder: share the player's dashboard, not a cut-down card): Weekly Projection Rankings, Season Simulations, the Dynasty Board.
export const SHARE_SOURCES = [
  { path: "/tools/lab", from: "The Observatory", cta: "Open this chart in The Observatory" },
  { path: "/tools/redraft-rankings", from: "Weekly Projection Rankings", cta: "Open Weekly Projection Rankings" },
  { path: "/tools/player-simulations", from: "Season Simulations", cta: "Open Season Simulations" },
  { path: "/tools/draft-board", from: "the Dynasty Board", cta: "Open the Dynasty Board" },
  { path: "/account/sky", from: "The Night Sky", cta: "Start your own sky", exact: true },
];
export const shareSource = (view) => SHARE_SOURCES.find((x) => (x.exact ? view === x.path : view === x.path || view.startsWith(`${x.path}?`))) || SHARE_SOURCES[0];

// What may be stored with a share: a title and caption (trimmed, capped) and the page it came from (only one of SHARE_SOURCES, with an
// optional query string, so a share page can never point anywhere else). Null when something is missing or wrong.
export function cleanShareMeta({ title, caption, view }) {
  const t = String(title || "").trim().slice(0, 160);
  const c = String(caption || "").trim().slice(0, 400);
  const v = String(view || "");
  const ok = SHARE_SOURCES.some((x) => (x.exact ? v === x.path : new RegExp(`^${x.path.replace(/\//g, "\\/")}(\\?[^\\s#]{0,800})?$`).test(v)));
  if (!t || !ok) return null;
  return { title: t, caption: c, view: v };
}

// A PNG starts with these eight bytes.
export function isPng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return Boolean(bytes && bytes.length > 8 && sig.every((b, i) => bytes[i] === b));
}

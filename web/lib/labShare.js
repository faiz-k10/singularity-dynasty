// Shared charts from The Lab (app/tools/lab/LabShare.js -> app/api/lab-share -> app/s/[id]). Each share is a picture of the chart and a small
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

// What may be stored with a share: a title and caption (trimmed, capped) and the Lab view it came from (only a /tools/lab link, so a share
// page can never point anywhere else). Null when something is missing or wrong.
export function cleanShareMeta({ title, caption, view }) {
  const t = String(title || "").trim().slice(0, 160);
  const c = String(caption || "").trim().slice(0, 400);
  const v = String(view || "");
  if (!t || !/^\/tools\/lab(\?[^\s#]{0,800})?$/.test(v)) return null;
  return { title: t, caption: c, view: v };
}

// A PNG starts with these eight bytes.
export function isPng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return Boolean(bytes && bytes.length > 8 && sig.every((b, i) => bytes[i] === b));
}

// The address each platform opens with a post ready to go (the link's preview shows the chart). Discord, Instagram and TikTok have none.
export function composeUrl(platform, { url, text }) {
  const e = encodeURIComponent;
  switch (platform) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${e(`${text} ${url}`)}`;
    case "bluesky":
      return `https://bsky.app/intent/compose?text=${e(`${text} ${url}`)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}`;
    default:
      return null;
  }
}

// Allows `limit` shares per key (an address) in any `windowMs`; `hits` is a Map kept by the caller. Returns false when over.
export function allowShare(hits, key, now, limit = 20, windowMs = 60 * 60 * 1000) {
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

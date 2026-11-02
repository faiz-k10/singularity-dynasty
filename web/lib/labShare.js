// Shared charts from The Lab (app/tools/lab/LabExport.js -> app/api/lab-share -> app/s/[id]). Each share is a picture of the chart and a small
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

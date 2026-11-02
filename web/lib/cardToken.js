import { createHmac, timingSafeEqual } from "node:crypto";

// Share cards (/c/<token>, app/c/[token]): a card's link IS its description, signed by the server, so only cards the site made exist.
// That matters because a card can show a player outside the free top 50 -- a member made it, the page is public (link previews need
// that), but nobody can type in a URL for any other player. Pure; tested in test/cardToken.test.mjs.
//   p  one player's week     { k: "p", s: season, w: week, n: name, pos }
//   d  one player's dynasty  { k: "d", id, f: "sf" | "1qb", m: "contender" | "rebuilder" }
//   s  start / sit           { k: "s", s, w, a: [name, pos], b: [name, pos] }

const POS = new Set(["QB", "RB", "WR", "TE"]);
const name = (v) => typeof v === "string" && v.length >= 2 && v.length <= 60;
const season = (v) => Number.isInteger(v) && v >= 2020 && v <= 2100;
const week = (v) => Number.isInteger(v) && v >= 1 && v <= 23;
const pair = (v) => Array.isArray(v) && v.length === 2 && name(v[0]) && POS.has(v[1]);

// The card if it is well-formed, else null (only the fields above are kept).
export function cleanCard(c) {
  if (!c || typeof c !== "object") return null;
  if (c.k === "p" && season(c.s) && week(c.w) && name(c.n) && POS.has(c.pos)) return { k: "p", s: c.s, w: c.w, n: c.n, pos: c.pos };
  if (c.k === "d" && name(c.id) && (c.f === "sf" || c.f === "1qb") && (c.m === "contender" || c.m === "rebuilder")) return { k: "d", id: c.id, f: c.f, m: c.m };
  if (c.k === "s" && season(c.s) && week(c.w) && pair(c.a) && pair(c.b) && c.a[0] !== c.b[0]) return { k: "s", s: c.s, w: c.w, a: [c.a[0], c.a[1]], b: [c.b[0], c.b[1]] };
  return null;
}

const sigOf = (body, secret) => createHmac("sha256", secret).update(body).digest("base64url").slice(0, 22);

export function signCard(card, secret) {
  const clean = cleanCard(card);
  if (!clean || !secret) return null;
  const body = Buffer.from(JSON.stringify(clean)).toString("base64url");
  return `${body}.${sigOf(body, secret)}`;
}

// The card a token stands for, or null when it is malformed or not signed by us.
export function readCardToken(token, secret) {
  if (typeof token !== "string" || token.length > 500 || !secret) return null;
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(sigOf(m[1], secret));
  const got = Buffer.from(m[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return cleanCard(JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

// Email address checks for the newsletter form (pure; tested in test/emailRules.test.mjs). Deliberately simple: one @, a
// dotted domain, no spaces, at most 254 characters, lower-cased so the same person can't be on the list twice.
export function normalizeEmail(v) {
  const e = String(v ?? "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e)) return null;
  return e;
}

// "jo***@gmail.com": enough for someone to recognise their own address on the unsubscribe page, not enough to harvest it.
export function maskEmail(e) {
  const [user, domain] = String(e || "").split("@");
  if (!domain) return "";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(user.length - 2, 6)))}@${domain}`;
}

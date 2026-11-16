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

// A first or last name from the newsletter quiz: trimmed, inner spaces collapsed, 1-40 characters, letters (any alphabet),
// spaces, apostrophes, hyphens and periods only -- so nobody can put a link or markup into the list. null = not acceptable.
export function cleanName(v) {
  const n = String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (n.length < 1 || n.length > 40 || !/^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u.test(n)) return null;
  return n;
}

// The quiz's answers kept only when EVERY question has one of its own options (a hand-made request can't store anything else).
export function cleanQuizAnswers(answers, questions) {
  if (!answers || typeof answers !== "object") return null;
  const out = {};
  for (const q of questions) {
    const v = Number(answers[q.key]);
    if (!q.options.some((o) => o.value === v)) return null;
    out[q.key] = v;
  }
  return out;
}

// Keeps secret keys out of what visitors download (Nov 19 2026, founder, after a post about vibe-coded apps shipping their Stripe /
// OpenAI keys to the browser). Pure, so next.config.mjs, scripts/check-bundle-secrets.mjs and the tests share it (test/secretGuard.test.mjs).
//
// In Next.js any variable named NEXT_PUBLIC_* is copied INTO the browser JavaScript on purpose (Vite's VITE_* does the same). Only values
// that are public by design may carry that name: the Supabase URL and its anon key, the Stripe PUBLISHABLE key (pk_), the Turnstile site
// key, the site's own URL. Everything else -- Stripe's secret / restricted / webhook keys, the Supabase service-role key, Resend, any AI
// key -- must never be NEXT_PUBLIC_.

// What a secret looks like, by its prefix or shape.
export const SECRET_PATTERNS = [
  { name: "Stripe secret key", re: /\bsk_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: "Stripe restricted key", re: /\brk_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{10,}/ },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/ },
  { name: "OpenAI / Anthropic key", re: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/ },
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

// A Supabase JWT says which role it is; only "anon" may be public.
export function jwtRole(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  try {
    const json = typeof Buffer !== "undefined" ? Buffer.from(parts[1], "base64url").toString() : atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

// Every secret-looking thing in a piece of text: [{ name }] (never the value itself).
export function findSecrets(text) {
  const t = String(text || "");
  const out = SECRET_PATTERNS.filter((p) => p.re.test(t)).map((p) => ({ name: p.name }));
  for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    const role = jwtRole(m[0]);
    if (role && role !== "anon") out.push({ name: `a "${role}" token (only the anon key may be public)` });
  }
  return out;
}

// The NEXT_PUBLIC_* variables that hold a secret: [{ key, problem }]. The build refuses to run while this is not empty.
export function publicEnvProblems(env) {
  const out = [];
  for (const [key, value] of Object.entries(env || {})) {
    if (!key.startsWith("NEXT_PUBLIC_") || !value) continue;
    for (const s of findSecrets(value)) out.push({ key, problem: s.name });
    // (Vercel's own NEXT_PUBLIC_VERCEL_* system variables are public by design and skipped, so a deploy can't be blocked by them)
    if (!key.startsWith("NEXT_PUBLIC_VERCEL_") && /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|WEBHOOK|API_KEY|TOKEN/.test(key.slice(12))) out.push({ key, problem: "its name says it is secret" });
  }
  return out;
}

// Values of the secret (non-public) variables, for checking that none of them appears in a built file.
export function secretValues(env) {
  return Object.entries(env || {}).filter(([k, v]) => !k.startsWith("NEXT_PUBLIC_") && /KEY|SECRET|TOKEN|PASSWORD|ROLE/.test(k) && typeof v === "string" && v.length >= 16 && /[A-Za-z]/.test(v) && /\d/.test(v));
}

// Every message the sign-in pages can show, keyed by the short code in ?error= / ?message=. The pages print ONLY these
// fixed texts -- they used to print whatever the URL said, so anyone could send a link that showed their own words
// ("Your account is locked, call ...") on our sign-in page.
export const AUTH_ERRORS = {
  credentials: "That email and password don't match an account.",
  unconfirmed: "Confirm your email first: open the link we sent you, then sign in. Didn't get it? Use Create Account again to resend it.",
  "weak-password": "Use a password of at least 8 characters.",
  "rate-limit": "Too many attempts. Wait a few minutes and try again.",
  "missing-fields": "Enter your email and a password.",
  "link-expired":
    "That link has expired or was opened on another device. If you were confirming your email, it's confirmed: sign in below. To reset your password, request a new link.",
  "passwords-differ": "The two passwords don't match.",
  "same-password": "Choose a password different from your current one.",
  "reset-needs-session": "Open the reset link from your email to set a new password.",
  captcha: "We couldn't confirm you're a person. Finish the check above the buttons and try again.",
  unknown: "Something went wrong. Please try again.",
};

export const AUTH_MESSAGES = {
  "check-email": "Check your email to confirm your account, then sign in.",
  "reset-sent": "If that email has an account, a link to reset the password is on its way.",
  "signed-out": "You're signed out.",
  "account-deleted": "Your account and everything saved with it have been deleted. Any subscription was canceled.",
};

// A Supabase Auth error -> one of the codes above (error.code is stable; the message text is the fallback).
export function authErrorCode(error) {
  const code = error?.code || "";
  const msg = (error?.message || "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login")) return "credentials";
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "unconfirmed";
  if (code === "same_password") return "same-password";
  if (code === "weak_password" || msg.includes("password should")) return "weak-password";
  if (code === "captcha_failed" || msg.includes("captcha")) return "captcha";
  if (code.startsWith("over_") || msg.includes("rate limit") || msg.includes("security purposes")) return "rate-limit";
  return "unknown";
}

// Only same-site paths ("/my-team"), never an absolute or protocol-relative URL.
// Security pass Nov 16 2026: browsers silently drop tabs and newlines from an address, so "/\t/evil.com" used to pass the old prefix
// checks and land on evil.com. Now any control character or space is refused, and the path is resolved the way a browser resolves it
// and must stay on this site.
const PROBE = "https://same-site.invalid";
export function safeNext(value) {
  const v = typeof value === "string" ? value.slice(0, 500) : "";
  if (!v.startsWith("/") || v.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(v)) return "";
  try {
    const u = new URL(v, PROBE);
    return u.origin === PROBE ? v : "";
  } catch {
    return "";
  }
}

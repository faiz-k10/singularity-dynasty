import SiteHeader from "../SiteHeader";
import { AUTH_ERRORS, AUTH_MESSAGES } from "@/lib/authMessages";

// The card every sign-in page sits in (sign in, forgot password, set a new password) and the site's 404 page. `error` /
// `message` are the codes from the URL; only the fixed texts in lib/authMessages.js are ever shown.
export default function AuthCard({ eyebrow = "Account", title, sub, error, message, children }) {
  const errorText = error ? AUTH_ERRORS[error] || AUTH_ERRORS.unknown : null;
  const messageText = AUTH_MESSAGES[message] || null;
  return (
    <div className="auth-page">
      <SiteHeader />
      <div className="wrap auth-wrap">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">{eyebrow}</div>
          <h1>{title}</h1>
          {sub && <p className="auth-sub">{sub}</p>}
          {errorText && <p className="auth-error mono" role="alert">{errorText}</p>}
          {messageText && <p className="auth-notice mono">{messageText}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import ThemeToggle from "../ThemeToggle";
import InteractiveScript from "../InteractiveScript";

export const metadata = {
  title: "Contact — Singularity Dynasty",
};

const SUPPORT_EMAIL = "eremruh11@gmail.com";

export default function ContactPage() {
  return (
    <div className="auth-page">
      <ThemeToggle />
      <div className="wrap auth-wrap">
        <Link href="/" className="brandmark auth-back">
          <span className="ring"></span>Singularity Dynasty
        </Link>

        <div className="auth-card reveal in">
          <div className="eyebrow blue">Contact</div>
          <h1>Get in touch.</h1>
          <p className="auth-sub">
            Billing questions, refund requests, data corrections, or
            anything else — reach out and we&apos;ll get back to you.
          </p>

          <div className="auth-actions">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn-primary">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>
      <InteractiveScript />
    </div>
  );
}

import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Contact — Dynasty Singularity",
};

const SUPPORT_EMAIL = "eremruh11@gmail.com";

export default function ContactPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap auth-wrap">
        <div className="auth-card reveal in">
          <div className="eyebrow blue">Contact</div>
          <h1>Get in touch.</h1>
          <p className="auth-sub">
            Billing questions, refund requests, data corrections, or
            anything else — reach out and we&apos;ll get back to you.
          </p>

          <div className="auth-actions center">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn-primary">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

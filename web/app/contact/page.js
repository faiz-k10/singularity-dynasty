import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Contact — Dynasty Singularity",
};

const GENERAL_EMAIL = "hello@dynastysingularity.com";
const SUPPORT_EMAIL = "support@dynastysingularity.com";

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
            anything else. Write to support for your account or a payment, or to hello for everything else, and we&apos;ll get back to you.
          </p>

          <div className="auth-actions center">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn-primary">
              {SUPPORT_EMAIL}
            </a>
            <a href={`mailto:${GENERAL_EMAIL}`} className="btn-ghost">
              {GENERAL_EMAIL}
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

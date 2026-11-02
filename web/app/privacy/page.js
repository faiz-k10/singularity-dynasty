import Link from "next/link";
import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Privacy Policy — Singularity Dynasty",
};

export default function PrivacyPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap auth-wrap">
        <div className="legal-card reveal in">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: August 2026</p>

          <h2>1. Information We Collect</h2>
          <p>
            <strong>Account information:</strong> When you create an
            account, we collect your email address and password. Passwords
            are handled by our authentication provider, Supabase, and are
            never visible to us in plain text.
          </p>
          <p>
            <strong>Payment information:</strong> If you subscribe to a paid
            tier, payment is processed by Stripe. We do not collect or store
            your full card number, CVC, or other card details — Stripe
            handles that directly and shares with us only what&apos;s needed
            to manage your subscription (such as your subscription status
            and a customer reference ID).
          </p>
          <p>
            <strong>Usage data:</strong> We may collect basic technical data
            (such as browser type and general usage patterns) to keep the
            Service running and to understand how it&apos;s used. That includes
            which upgrade prompts a visitor sees and clicks; we record the
            prompt and the page (never your IP address), and attach it to your
            account only when you are signed in.
          </p>

          <h2>2. Cookies</h2>
          <p>
            We use a session cookie to keep you signed in, managed through
            Supabase. We do not currently use third-party advertising or
            tracking cookies.
          </p>

          <h2>3. How We Use Information</h2>
          <ul>
            <li>To create and maintain your account;</li>
            <li>To process payments and manage subscriptions;</li>
            <li>
              To provide customer support and respond to your requests;
            </li>
            <li>To maintain the security and integrity of the Service;</li>
            <li>To communicate service-related updates to you.</li>
          </ul>
          <p>
            If you subscribe to our newsletter, we&apos;ll use your email to
            send it. You can unsubscribe at any time.
          </p>

          <h2>4. How We Share Information</h2>
          <p>
            We do not sell your personal information. We share information
            only with the service providers necessary to operate Singularity
            Dynasty — currently Stripe (payments) and Supabase (accounts and
            data storage) — or when required by law.
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain account information for as long as your account is
            active. If you delete your account, we delete or anonymize your
            personal information within a reasonable period, except where we
            are required to retain it (for example, billing records for tax
            purposes).
          </p>

          <h2>6. Your Rights &amp; Choices</h2>
          <p>
            You can access or update your account information at any time
            from your account page. To request a copy of your data, or to
            request deletion of your account and associated data, contact us
            via our <Link href="/contact">Contact</Link> page. Depending on
            where you live, you may have additional rights over your
            personal data under laws such as the GDPR or CCPA; we&apos;ll
            honor applicable requests to the extent required.
          </p>

          <h2>7. Data Security</h2>
          <p>
            We rely on industry-standard security practices from our
            infrastructure providers (Supabase and Stripe) to protect your
            information, including encryption in transit. No method of
            transmission or storage is 100% secure, and we cannot guarantee
            absolute security.
          </p>

          <h2>8. Children&apos;s Privacy</h2>
          <p>
            Singularity Dynasty is not directed at children under 13, and we
            do not knowingly collect personal information from children
            under 13. Consistent with our <Link href="/terms">Terms of
            Service</Link>, the Service is intended for users 18 and older.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be reflected by an updated &quot;Last updated&quot;
            date above.
          </p>

          <h2>10. Contact</h2>
          <p>
            Questions about this Privacy Policy? Visit our{" "}
            <Link href="/contact">Contact</Link> page.
          </p>
        </div>
      </main>
    </div>
  );
}

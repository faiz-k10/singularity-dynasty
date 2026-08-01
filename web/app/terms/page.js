import Link from "next/link";
import ThemeToggle from "../ThemeToggle";
import InteractiveScript from "../InteractiveScript";

export const metadata = {
  title: "Terms of Service — Singularity Dynasty",
};

export default function TermsPage() {
  return (
    <div className="auth-page">
      <ThemeToggle />
      <div className="wrap auth-wrap">
        <Link href="/" className="brandmark auth-back">
          <span className="ring"></span>Singularity Dynasty
        </Link>

        <div className="legal-card reveal in">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: August 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Singularity Dynasty (the
            &quot;Service&quot;), you agree to be bound by these Terms of
            Service (&quot;Terms&quot;). If you do not agree, do not use the
            Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Singularity Dynasty provides fantasy football analytics,
            including dynasty and redraft rankings, player season
            simulations, best ball rankings, draft board tools, team
            analysis, and prospect rankings, delivered through a
            subscription-based website. The Service is provided for
            informational and entertainment purposes in connection with
            fantasy football roster management only. See our{" "}
            <Link href="/disclaimer">Disclaimer</Link> for important
            limitations, including that the Service is not intended for use
            in gambling, betting, or wagering of any kind.
          </p>

          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years old to create an account or
            subscribe to the Service. By using the Service, you represent
            that you meet this requirement.
          </p>

          <h2>4. Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity under your account. You
            agree to provide accurate account information and to notify us
            promptly of any unauthorized use of your account.
          </p>

          <h2>5. Subscriptions, Billing &amp; Cancellation</h2>
          <p>
            Paid tiers (Explorer and Singularity) are billed on a recurring
            monthly or annual basis through our payment processor, Stripe.
            By subscribing, you authorize recurring charges until you
            cancel. You may cancel at any time from your account page;
            cancellation takes effect at the end of your current billing
            period, and you retain access until then. We do not prorate
            partial billing periods.
          </p>
          <p>
            <strong>Refunds:</strong> if you are not satisfied within the
            first 14 days of a new paid subscription, contact us via our{" "}
            <Link href="/contact">Contact</Link> page for a full refund.
            Refund requests outside this window are evaluated at our
            discretion.
          </p>
          <p>
            We may change subscription pricing with reasonable advance
            notice; continued use of the Service after a price change takes
            effect constitutes acceptance of the new pricing.
          </p>

          <h2>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Scrape, copy, redistribute, or resell Service Content without
              our written permission;
            </li>
            <li>
              Reverse engineer, decompile, or attempt to extract the
              underlying models or source code of the Service;
            </li>
            <li>Share paid-tier account access with non-subscribers;</li>
            <li>
              Use the Service in any way that violates applicable law or
              infringes the rights of others.
            </li>
          </ul>

          <h2>7. Intellectual Property</h2>
          <p>
            All rankings, projections, simulations, written content,
            design, and branding on the Service (&quot;Content&quot;) are
            owned by Singularity Dynasty or its licensors and are protected
            by intellectual property law. Subject to these Terms, we grant
            you a limited, non-exclusive, non-transferable license to access
            and use the Content for your personal, non-commercial use.
          </p>

          <h2>8. Disclaimer of Warranties</h2>
          <p>
            The Service and all Content are provided &quot;as is&quot; and
            &quot;as available,&quot; without warranties of any kind,
            express or implied, including but not limited to accuracy,
            completeness, reliability, or fitness for a particular purpose.
            We do not guarantee that the Service will be uninterrupted,
            error-free, or that any projection or simulation will reflect
            actual outcomes.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Singularity Dynasty and
            its founder, employees, and contributors will not be liable for
            any indirect, incidental, special, consequential, or punitive
            damages, or any loss of profits, revenue, data, or — as
            described in our <Link href="/disclaimer">Disclaimer</Link> —
            any gains or losses related to gambling, betting, or wagering
            activity, arising from your use of the Service. Our total
            liability for any claim arising from the Service will not
            exceed the amount you paid us in the twelve (12) months
            preceding the claim.
          </p>

          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold Singularity Dynasty harmless
            from any claims, damages, or expenses arising from your use of
            the Service or violation of these Terms.
          </p>

          <h2>11. Termination</h2>
          <p>
            We may suspend or terminate your account for violation of these
            Terms. You may stop using the Service and cancel your
            subscription at any time.
          </p>

          <h2>12. Governing Law</h2>
          <p>
            These Terms are governed by the laws applicable in the
            jurisdiction in which Singularity Dynasty operates, without
            regard to conflict-of-law principles.
          </p>

          <h2>13. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of
            the Service after changes take effect constitutes acceptance of
            the revised Terms.
          </p>

          <h2>14. Contact</h2>
          <p>
            Questions about these Terms? Visit our{" "}
            <Link href="/contact">Contact</Link> page.
          </p>
        </div>
      </div>
      <InteractiveScript />
    </div>
  );
}

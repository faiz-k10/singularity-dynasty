import Link from "next/link";
import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Disclaimer — Dynasty Singularity",
};

export default function DisclaimerPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap auth-wrap">
        <div className="legal-card reveal in">
          <h1>Disclaimer</h1>
          <p className="legal-updated">Last updated: August 2026</p>

          <div className="legal-callout">
            <p>
              <strong>
                Dynasty Singularity is not a gambling, betting, or wagering
                service, and none of our content is intended to be used for
                that purpose.
              </strong>{" "}
              All rankings, projections, simulations, grades, and written
              content (&quot;Content&quot;) are provided strictly for
              informational and entertainment purposes in connection with
              fantasy football roster management.
            </p>
          </div>

          <h2>No Gambling or Wagering Use</h2>
          <p>
            Our Content is not intended, designed, or licensed for use in
            connection with sports betting, daily fantasy contests involving
            cash prizes, wagering of any kind, or any activity regulated as
            gambling under the laws of any jurisdiction. If you choose to use
            our Content in connection with any such activity, you do so
            entirely at your own risk and discretion.
          </p>
          <p>
            Dynasty Singularity, its founder, employees, and contributors
            disclaim any and all responsibility or liability for any
            financial gains or losses — including losses related to
            wagering, betting, or any cash-prize contest — that result, in
            whole or in part, from your use of our Content. We do not
            represent, and you should not assume, that our Content is
            suitable or reliable for any wagering-related decision.
          </p>

          <h2>No Guarantee of Accuracy or Outcomes</h2>
          <p>
            Our projections and simulations are statistical models built on
            historical and current data. Sports outcomes are inherently
            unpredictable. Past model performance does not guarantee future
            accuracy, and we make no warranty, express or implied, regarding
            the completeness, accuracy, or reliability of any Content.
          </p>

          <h2>Not Professional Advice</h2>
          <p>
            Nothing on this site constitutes financial, legal, or
            professional advice of any kind. You are solely responsible for
            any decisions you make using our Content, fantasy-related or
            otherwise.
          </p>

          <h2>Legal Compliance Is Your Responsibility</h2>
          <p>
            Laws regarding fantasy sports and wagering vary by jurisdiction.
            It is your responsibility to know and comply with the laws that
            apply to you wherever you access this site.
          </p>

          <h2>No Affiliation</h2>
          <p>
            Dynasty Singularity is an independent, third-party analytics
            service. We are not affiliated with, endorsed by, or sponsored
            by the National Football League (NFL), the NFL Players
            Association, any NFL team, or any fantasy sports platform
            (including but not limited to Sleeper, ESPN, Yahoo, or Underdog
            Fantasy). All team and player names are the property of their
            respective owners and are used for identification purposes
            only.
          </p>

          <h2>Questions</h2>
          <p>
            If anything here is unclear, reach out via our{" "}
            <Link href="/contact">Contact</Link> page.
          </p>
        </div>
      </main>
    </div>
  );
}

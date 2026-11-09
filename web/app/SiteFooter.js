import Link from "next/link";

// The one footer every page ends with (rendered once by app/layout.js): the tools, help and legal pages, so anything on the
// site is two clicks away from anywhere. Full-screen board views sit above it.
const COLUMNS = [
  ["Tools", [["/tools/redraft-rankings", "Weekly Rankings"], ["/tools/player-simulations", "Season Simulations"], ["/tools/draft-board", "Dynasty Draft Board"], ["/tools/lab", "The Observatory"], ["/my-team", "My Team"]]],
  ["Help", [["/how-it-works", "How It Works"], ["/how-it-works#faq", "FAQ"], ["/glossary", "Glossary"], ["/contact", "Contact"]]],
  ["Account", [["/#pricing", "Plans & Pricing"], ["/account", "Your Account"], ["/login", "Sign In"]]],
  ["Legal", [["/terms", "Terms"], ["/privacy", "Privacy"], ["/disclaimer", "Disclaimer"]]],
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="sf-top">
          <div className="sf-brand">
            <div className="fbrand">Singularity Dynasty</div>
            <p className="sf-tag">Where the data reaches its endpoint.</p>
          </div>
          <nav className="sf-cols" aria-label="Footer">
            {COLUMNS.map(([title, links]) => (
              <div key={title} className="sf-col">
                <h2 className="sf-h mono">{title}</h2>
                <ul>
                  {links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="fcoord mono" aria-hidden="true">VOID // #0B0B0B</div>
        <div className="fsmall">
          © {new Date().getFullYear()} Singularity Dynasty. Not affiliated with the NFL or any fantasy football platform. Content is for
          informational and entertainment purposes only and is not intended for use in gambling, betting, or wagering of any kind; see
          our <Link href="/disclaimer">Disclaimer</Link>.
        </div>
      </div>
    </footer>
  );
}

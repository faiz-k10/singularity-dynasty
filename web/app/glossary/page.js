import Link from "next/link";
import SiteHeader from "../SiteHeader";
import { GLOSSARY, slug } from "@/lib/glossary";
import GlossaryFilter from "./GlossaryFilter";

export const metadata = {
  title: "Glossary — Dynasty Singularity",
  description: "Every number and badge on Dynasty Singularity in plain words: floor, median, ceiling, xFP, WOPR, RYOE, CPOE, EPA, Smash Spot and more.",
};

// Every term in lib/glossary.js (the same text the tap-to-define labels show), grouped, each with its own #anchor so a
// label's "Full glossary" link lands on it.
export default function GlossaryPage() {
  const count = GLOSSARY.reduce((n, g) => n + g.terms.length, 0);
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap doc-wrap">
        <div className="eyebrow">Help</div>
        <h1 className="doc-h1">Glossary</h1>
        <p className="doc-lede">
          {count} terms, in plain words. Tap any underlined stat name on the site to see its definition without leaving the page. For how the numbers are made and how often
          they&apos;re right, see <Link href="/how-it-works">How It Works</Link>.
        </p>
        <nav className="doc-jump" aria-label="Glossary sections">
          {GLOSSARY.map((g) => (
            <a key={g.group} href={`#${slug(g.group)}`} className="doc-chip mono">
              {g.group}
            </a>
          ))}
        </nav>
        <GlossaryFilter />
        {GLOSSARY.map((g) => (
          <section key={g.group} id={slug(g.group)} className="doc-section gl-group" aria-labelledby={`h-${slug(g.group)}`}>
            <h2 id={`h-${slug(g.group)}`} className="doc-h2">
              {g.group}
            </h2>
            <dl className="gl-list">
              {g.terms.map((t) => (
                <div key={t.id} id={t.id} className="gl-item" data-search={`${t.term} ${t.full || ""} ${t.def}`.toLowerCase()}>
                  <dt>
                    <span className="gl-term">{t.term}</span>
                    {t.full && <span className="gl-full mono">{t.full}</span>}
                  </dt>
                  <dd>{t.def}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </main>
    </div>
  );
}

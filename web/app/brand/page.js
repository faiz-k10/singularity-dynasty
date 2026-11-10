import SiteHeader from "../SiteHeader";

export const metadata = {
  title: "Brand Assets — Singularity Dynasty",
  description: "Download the Singularity Dynasty logo for profile pictures and press: light and dark, with and without the SD initials.",
};

// The logo files to download (founder, Nov 10 2026). The images live in public/brand/ and are drawn by scripts/make-brand-logos.mjs from the same
// geometry as the site's own logo (lib/brandMark.js) -- rerun that script after any change to the mark.
const LOGOS = [
  { file: "logo-light", name: "Light", note: "The football in the disc, SD for its laces. Ember line on bone." },
  { file: "logo-dark", name: "Dark", note: "The football in the disc, SD for its laces. Cobalt line on black." },
  { file: "logo-light-sd", name: "Light · Initials", note: "Just the SD initials in the disc." },
  { file: "logo-dark-sd", name: "Dark · Initials", note: "Just the SD initials in the disc." },
];

export default function BrandPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap doc-wrap">
        <div className="eyebrow">Brand</div>
        <h1 className="doc-h1">Brand Assets</h1>
        <p className="doc-lede">
          The Singularity Dynasty logo, ready for a profile picture or a write-up. Square PNGs, centred with room to spare so a round crop never cuts the mark.
          The 2048px file is the sharpest; 1024px suits most uploads, and 400px is the size most platforms show.
        </p>
        <div className="brand-grid">
          {LOGOS.map((l) => (
            <figure key={l.file} className="brand-card">
              <img src={`/brand/${l.file}-400.png`} alt={`Singularity Dynasty logo, ${l.name.toLowerCase()}`} width={400} height={400} loading="lazy" />
              <figcaption>
                <b>{l.name}</b>
                <span>{l.note}</span>
                <span className="brand-dl">
                  <a href={`/brand/${l.file}-2048.png`} download>PNG 2048</a>
                  <a href={`/brand/${l.file}-1024.png`} download>PNG 1024</a>
                  <a href={`/brand/${l.file}-400.png`} download>PNG 400</a>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import SiteHeader from "./SiteHeader";
import ShareCardButton from "./ShareCardButton";
import { isLiveReferralCode } from "@/lib/referrals";
import { FRIEND_DISCOUNT_PERCENT } from "@/lib/referralRules";

// The page behind every share card (/c/<token>, /receipts/<week>, /smash/<week>). It exists mostly for its link preview -- the card picture
// is its og:image -- and a visitor who clicks through sees the card, a way into the tool it came from, a way to share it on, and, when the
// link carries a member's code, the friend discount.
export function cardMetadata({ title, description, image }) {
  const images = [{ url: image, width: 1200, height: 630, alt: title }];
  return {
    title: `${title} — Dynasty Singularity`,
    description,
    openGraph: { title, description, images, type: "article", siteName: "Dynasty Singularity" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShareCardPage({ eyebrow, title, description, image, tool, share, caption, file, refCode, children }) {
  const invited = refCode ? await isLiveReferralCode(refCode) : false;
  return (
    <div className="tool-page">
      <SiteHeader />
      <main id="main-content" className="wrap tool-wrap share-wrap">
        {invited && (
          <p className="ref-banner" role="status">
            <span className="mono">A friend shared this</span> {FRIEND_DISCOUNT_PERCENT}% off your first payment on any plan is saved for you.{" "}
            <Link href="/#pricing">See plans</Link>
          </p>
        )}
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="tool-sub">{description}</p>}
        <figure className="share-figure glass-panel">
          {/* eslint-disable-next-line @next/next/no-img-element -- the card is a generated PNG at its full size */}
          <img src={image} alt={title} width={1200} height={630} />
        </figure>
        {children}
        <div className="share-actions">
          <Link href={tool.href} className="btn-primary">
            {tool.label}
          </Link>
          <ShareCardButton card={share} caption={caption} file={file} label="Share this card" className="btn-ghost" />
          <Link href="/#pricing" className="btn-ghost">
            See the plans
          </Link>
        </div>
      </main>
    </div>
  );
}

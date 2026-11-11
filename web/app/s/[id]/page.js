import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../SiteHeader";
import { SHARE_BUCKET, SHARE_W, SHARE_H, isShareId } from "@/lib/labShare";

// A chart shared from The Observatory. The page exists mostly for its link preview: X, Threads, Bluesky, Facebook, LinkedIn, Reddit and Discord show
// og:image -- the chart -- when the link is posted. A visitor who clicks through sees the chart, its caption and a way into The Observatory.
const fileUrl = (id, ext) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${SHARE_BUCKET}/${id}.${ext}`;

async function loadShare(id) {
  if (!isShareId(id)) return null;
  try {
    // A share never changes once made, so its description is cached for a day.
    const res = await fetch(fileUrl(id, "json"), { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const meta = await res.json();
    return { ...meta, image: fileUrl(id, "png") };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const share = await loadShare(id);
  if (!share) return { title: "Chart not found — Dynasty Singularity" };
  const sky = share.view === "/account/sky";
  const from = sky ? "The Night Sky" : "The Observatory";
  const title = `${share.title} — ${from} · Dynasty Singularity`;
  const description = share.caption || `From ${from} by Dynasty Singularity.`;
  const images = [{ url: share.image, width: SHARE_W, height: SHARE_H, alt: share.title }];
  return {
    title,
    description,
    openGraph: { title, description, images, type: "article", siteName: "Dynasty Singularity" },
    twitter: { card: "summary_large_image", title, description, images: [share.image] },
  };
}

export default async function SharedChartPage({ params }) {
  const { id } = await params;
  const share = await loadShare(id);
  if (!share) notFound();
  const sky = share.view === "/account/sky";
  const from = sky ? "The Night Sky" : "The Observatory";
  return (
    <div className="tool-page">
      <SiteHeader />
      <main id="main-content" className="wrap tool-wrap share-wrap">
        <div className="eyebrow">Shared from {from}</div>
        <h1>{share.title}</h1>
        {share.caption && <p className="tool-sub">{share.caption}</p>}
        <figure className="share-figure glass-panel">
          {/* eslint-disable-next-line @next/next/no-img-element -- the shared picture lives in Supabase Storage at its full size */}
          <img src={share.image} alt={share.title} width={SHARE_W} height={SHARE_H} />
        </figure>
        <div className="share-actions">
          <Link href={sky ? "/login?next=%2Faccount%2Fsky" : share.view} className="btn-primary">
            {sky ? "Start your own sky" : "Open this chart in The Observatory"}
          </Link>
          <Link href="/#pricing" className="btn-ghost">
            See the plans
          </Link>
        </div>
      </main>
    </div>
  );
}

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
  if (!share) return { title: "Chart not found — Singularity Dynasty" };
  const title = `${share.title} — The Observatory · Singularity Dynasty`;
  const description = share.caption || "Charted in The Observatory by Singularity Dynasty.";
  const images = [{ url: share.image, width: SHARE_W, height: SHARE_H, alt: share.title }];
  return {
    title,
    description,
    openGraph: { title, description, images, type: "article", siteName: "Singularity Dynasty" },
    twitter: { card: "summary_large_image", title, description, images: [share.image] },
  };
}

export default async function SharedChartPage({ params }) {
  const { id } = await params;
  const share = await loadShare(id);
  if (!share) notFound();
  return (
    <div className="tool-page">
      <SiteHeader />
      <main id="main-content" className="wrap tool-wrap share-wrap">
        <div className="eyebrow">Shared from The Observatory</div>
        <h1>{share.title}</h1>
        {share.caption && <p className="tool-sub">{share.caption}</p>}
        <figure className="share-figure glass-panel">
          {/* eslint-disable-next-line @next/next/no-img-element -- the shared picture lives in Supabase Storage at its full size */}
          <img src={share.image} alt={share.title} width={SHARE_W} height={SHARE_H} />
        </figure>
        <div className="share-actions">
          <Link href={share.view} className="btn-primary">
            Open this chart in The Observatory
          </Link>
          <Link href="/#pricing" className="btn-ghost">
            See the plans
          </Link>
        </div>
      </main>
    </div>
  );
}

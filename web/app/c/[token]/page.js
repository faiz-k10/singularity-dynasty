import { notFound } from "next/navigation";
import ShareCardPage, { cardMetadata } from "../../ShareCardPage";
import { cardFromToken } from "@/lib/cardData";

// A shared player, dynasty or start / sit card (made by ShareCardButton through /api/card; the link is signed, lib/cardToken.js).
export async function generateMetadata({ params }) {
  const { token } = await params;
  const c = await cardFromToken(token);
  if (!c) return { title: "Card not found — Singularity Dynasty", robots: { index: false } };
  return { ...cardMetadata({ title: c.title, description: c.description, image: `/c/${token}/image` }), robots: { index: false, follow: true } };
}

const EYEBROW = { p: "Weekly Projection Rankings", d: "Dynasty Draft Board", s: "Start / sit" };

export default async function CardPage({ params, searchParams }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const c = await cardFromToken(token);
  if (!c) notFound();
  const name = c.card.k === "s" ? `${c.card.a[0]}-vs-${c.card.b[0]}` : c.card.n || c.data.player?.name || "card";
  return (
    <ShareCardPage
      eyebrow={EYEBROW[c.card.k]}
      title={c.title}
      description={c.description}
      image={`/c/${token}/image`}
      tool={c.tool}
      share={{ kind: "token", token }}
      caption={c.caption}
      file={`singularity-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      refCode={typeof sp?.ref === "string" ? sp.ref : null}
    />
  );
}

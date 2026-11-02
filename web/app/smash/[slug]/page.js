import { notFound } from "next/navigation";
import ShareCardPage, { cardMetadata } from "../../ShareCardPage";
import { smashFor, parseWeekSlug } from "@/lib/cardData";
import { smashWords as words } from "@/lib/smashSpots";

// This week's Smash Spots and Tough Spots on one card (lib/smashSpots.js): the defense-vs-position trends Weekly Projection Rankings flags.
async function load(slug) {
  const wk = parseWeekSlug(slug);
  return wk ? smashFor(wk.season, wk.week) : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: "Smash Spots — Singularity Dynasty" };
  const w = words(d);
  return cardMetadata({ title: w.title, description: w.description, image: `/smash/${slug}/image` });
}

export default async function SmashPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const d = await load(slug);
  if (!d) notFound();
  const w = words(d);
  return (
    <ShareCardPage
      eyebrow={`Matchups · Week ${d.week} · ${d.season}`}
      title={w.title}
      description={w.description}
      image={`/smash/${slug}/image`}
      tool={{ href: "/tools/redraft-rankings", label: "See every player's matchup" }}
      share={{ kind: "smash", slug }}
      caption={w.caption}
      file={`singularity-smash-${slug}`}
      refCode={typeof sp?.ref === "string" ? sp.ref : null}
    />
  );
}

import { redirect } from "next/navigation";
import { latestWeek, weekSlug } from "@/lib/cardData";

// /smash always opens this week's card (keeping ?ref=).
export const dynamic = "force-dynamic";

export default async function LatestSmash({ searchParams }) {
  const [wk, sp] = await Promise.all([latestWeek(), searchParams]);
  const ref = typeof sp?.ref === "string" ? `?ref=${encodeURIComponent(sp.ref)}` : "";
  redirect(wk ? `/smash/${weekSlug(wk)}${ref}` : "/tools/redraft-rankings");
}

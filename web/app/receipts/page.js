import { redirect } from "next/navigation";
import { latestReceiptsWeek, weekSlug } from "@/lib/cardData";

// /receipts always opens the newest finished week (keeping ?ref= so a member's link still shows the friend discount).
export const dynamic = "force-dynamic";

export default async function LatestReceipts({ searchParams }) {
  const [wk, sp] = await Promise.all([latestReceiptsWeek(), searchParams]);
  const ref = typeof sp?.ref === "string" ? `?ref=${encodeURIComponent(sp.ref)}` : "";
  redirect(wk ? `/receipts/${weekSlug(wk)}${ref}` : "/how-it-works");
}

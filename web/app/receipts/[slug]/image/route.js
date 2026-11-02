import { receiptsFor, parseWeekSlug } from "@/lib/cardData";
import { rangeVerdict } from "@/lib/receipts";
import { cardImage, cardRequest, ReceiptsCard } from "@/lib/cardArt";

// The Receipts card's picture (a finished week never changes, so it is kept a week).
export async function GET(request, { params }) {
  const wk = parseWeekSlug((await params).slug);
  const data = wk && (await receiptsFor(wk.season, wk.week));
  if (!data) return new Response("Not found", { status: 404 });
  const req = cardRequest(request);
  return cardImage(<ReceiptsCard f={req.f} host={req.host} data={data} verdict={rangeVerdict(data)} />, req, { cache: 604800 });
}

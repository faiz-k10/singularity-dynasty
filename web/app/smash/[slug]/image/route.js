import { smashFor, parseWeekSlug } from "@/lib/cardData";
import { cardImage, cardRequest, SmashCard } from "@/lib/cardArt";

// The Smash Spots card's picture.
export async function GET(request, { params }) {
  const wk = parseWeekSlug((await params).slug);
  const data = wk && (await smashFor(wk.season, wk.week));
  if (!data) return new Response("Not found", { status: 404 });
  const req = cardRequest(request);
  return cardImage(<SmashCard f={req.f} host={req.host} data={data} />, req, { cache: 3600 });
}

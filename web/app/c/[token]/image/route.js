import { cardFromToken, latestWeek } from "@/lib/cardData";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { findBio } from "@/lib/portfolio";
import { cardImage, cardRequest, teamLogo, photo, PlayerCard, DynastyCard, StartSitCard } from "@/lib/cardArt";

// The picture of a share card (/c/<token>): wide 1200 x 630 for link previews, ?f=tall 1080 x 1350 for Instagram, ?dl=name to download.
const imgsFor = async (p, headshot) => {
  const [logo, ph] = await Promise.all([teamLogo(p.team), photo(headshot)]);
  return { logo, photo: ph };
};

export async function GET(request, { params }) {
  const { token } = await params;
  const c = await cardFromToken(token);
  if (!c) return new Response("Not found", { status: 404 });
  const req = cardRequest(request);
  const latest = await latestWeek();
  // a past week's card never changes; this week's can be republished (Thursday / Sunday refreshes); dynasty when a new board is committed
  const cache = c.card.k !== "d" && latest && (c.card.s < latest.season || c.card.w < latest.week) ? 604800 : 3600;
  let node;
  if (c.card.k === "p") {
    node = <PlayerCard f={req.f} host={req.host} data={c.data} img={await imgsFor(c.data.player, c.data.player.headshot)} />;
  } else if (c.card.k === "d") {
    const bios = await getPlayerBiosByNamePos();
    const p = c.data.player;
    node = <DynastyCard f={req.f} host={req.host} data={c.data} img={await imgsFor(p, findBio(bios, p.name, p.pos)?.headshot)} />;
  } else {
    const [a, b] = await Promise.all([imgsFor(c.data.a, c.data.a.headshot), imgsFor(c.data.b, c.data.b.headshot)]);
    node = <StartSitCard f={req.f} host={req.host} data={c.data} img={{ a, b }} />;
  }
  return cardImage(node, req, { cache });
}

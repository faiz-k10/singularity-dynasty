import { dragonBallSvg } from "@/lib/dragonBall";

// Super Hero badge art: an orange crystal ball with 1-6 red stars (one per top-3 finish this season, capped at 6).
// Source of truth for the art is lib/dragonBall.js.
export default function DragonBall({ stars, size = 24 }) {
  return <span className="dragon-ball" dangerouslySetInnerHTML={{ __html: dragonBallSvg(stars, size) }} />;
}

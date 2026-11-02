import Link from "next/link";
import { gravityNodes, expectedWins, radiusFor, RINGS, CORE, EDGE } from "@/lib/briefing";
import { fmt1 } from "@/lib/format";
import { formatWin } from "@/lib/standing";

// The signed-in home page's right side: the member's week as a gravity well. The core is the singularity; every league is a body pulled
// toward it by its chance to win (lib/briefing.js: distance = 1 - win chance), so favored leagues sit inside the mint event horizon and long
// shots drift out past the red ring. On load the bodies spiral in from the edge; toss-ups pulse. The core holds the wins to expect this
// week. Each body opens the Game Board. Server component: the rings are SVG in the map's own units (width 100), the bodies are placed with
// container units so the whole map scales with its column.
export default function GravityMap({ rows }) {
  const nodes = gravityNodes(rows);
  if (!nodes.length) return null;
  const { wins, of } = expectedWins(rows);
  return (
    <figure className="gm" aria-label={`Your week: ${nodes.map((n) => `${n.name} ${formatWin(n.p)}`).join(", ")}. About ${fmt1(wins)} wins expected.`}>
      <div className="gm-stage">
        <svg className="gm-rings" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="gm-ring is-outer" cx="50" cy="50" r={EDGE + 6} />
          <circle className="gm-ring is-spin" cx="50" cy="50" r={EDGE} />
          {RINGS.map((r, i) => (
            <g key={r.p}>
              <circle className={`gm-ring is-zone-${i}`} cx="50" cy="50" r={radiusFor(r.p)} />
              <text className={`gm-ring-label is-zone-${i}`} x="50" y={50 - radiusFor(r.p) - 1}>
                {r.label}
              </text>
            </g>
          ))}
        </svg>
        <div className="gm-core" style={{ "--core": `${CORE * 2 - 4}cqw` }}>
          <b>{fmt1(wins)}</b>
          <span>wins expected</span>
          <span>of {of} this week</span>
        </div>
        {nodes.map((n, i) => (
          <Link
            key={n.id}
            href="/my-team"
            className={`gm-node is-${n.tone || "grey"}${n.p >= 0.4 && n.p < 0.6 ? " is-close" : ""}`}
            style={{ "--a": `${n.angle}deg`, "--d": `${n.dist}cqw`, "--i": i }}
          >
            <i className="gm-dot" aria-hidden="true" />
            <span className="gm-label mono">
              <span className="gm-label-name">{n.name}</span>
              <span className="gm-label-pct">{formatWin(n.p)}</span>
            </span>
          </Link>
        ))}
      </div>
      <figcaption className="gm-caption mono">The closer to the core, the likelier the win. Inside the mint ring: favored.</figcaption>
    </figure>
  );
}

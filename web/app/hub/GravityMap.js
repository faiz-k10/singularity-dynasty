import GravityBodies from "./GravityBodies";
import { gravityNodes, expectedWins, radiusFor, RINGS, CORE, VK } from "@/lib/briefing";
import { fmt1 } from "@/lib/format";
import { formatWin } from "@/lib/standing";

// The signed-in home page's right side: the member's week as a gravity well on elliptical orbits (taller than wide, like a real orbit). The core is the singularity; every league is a body pulled
// toward it by its chance to win (lib/briefing.js: distance = 1 - win chance), so favored leagues sit inside the mint event horizon and long
// shots drift out past the red ring. The bodies circle the core on the wall clock, trailing a fading line (GravityBodies.js); toss-ups pulse. Only the three standing rings are drawn (no decorative rings, founder Nov 2 2026). The core holds the wins to expect this
// week. Each body opens the Game Board. Server component: the rings are SVG in the map's own units (width 100), the bodies are placed with
// container units so the whole map scales with its column.
export default function GravityMap({ rows, now }) {
  const nodes = gravityNodes(rows);
  if (!nodes.length) return null;
  const { wins, of, pct } = expectedWins(rows);
  return (
    <figure className="gm" aria-label={`Your week: ${nodes.map((n) => `${n.name} ${formatWin(n.p)}`).join(", ")}. About ${fmt1(wins)} of ${of} wins expected (${pct}%).`}>
      <div className="gm-stage" style={{ "--K": VK }}>
        <svg className="gm-rings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {RINGS.map((r, i) => (
            <ellipse key={r.p} className={`gm-ring is-zone-${i}`} cx="50" cy="50" rx={radiusFor(r.p)} ry={radiusFor(r.p) * VK} />
          ))}
        </svg>
        {RINGS.map((r, i) => (
          <span key={r.p} className={`gm-ring-label mono is-zone-${i}`} style={{ top: `${50 - radiusFor(r.p) * VK}%` }}>
            {r.label}
          </span>
        ))}
        <div className="gm-core" style={{ "--core": `${CORE * 2 - 4}cqw` }}>
          <b>{fmt1(wins)}</b>
          <span>of {of} wins</span>
          <span className="gm-core-pct">{pct}%</span>
        </div>
        <GravityBodies nodes={nodes} k={VK} now={now} />
      </div>
    </figure>
  );
}

import { getHubData } from "./hubData";

// The landing page's one oversized figure: the run count, set edge to edge over concentric event-horizon rules, with a
// telemetry ruler under it (0 to 10K) and the live counts as hairline-divided cells. Server component; reads the same
// cached hub data the hub below does (free-depth aggregates only). Decoration is lines, ticks and numbers -- no glow.
const RINGS = [60, 110, 165, 225, 290, 360, 440];

export default async function HorizonBand() {
  const data = await getHubData();
  const { counts, latest } = data;
  const runs = counts?.runs || 10000;
  const cells = [
    latest ? { k: `Week ${latest.week}`, v: `${latest.season} season` } : null,
    counts?.ranked ? { k: counts.ranked, v: "players ranked" } : null,
    counts?.simmed ? { k: counts.simmed, v: "seasons simulated" } : null,
    { k: "10 · 50 · 90", v: "floor · median · ceiling" },
  ].filter(Boolean);
  const labels = Array.from({ length: 11 }, (_, i) => (i === 0 ? "0" : i === 10 ? `${runs / 1000}K` : `${i}K`));

  return (
    <div className="horizon-band" aria-label={`${runs.toLocaleString()} simulated runs per player`}>
      <svg className="hb-rings" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g className="hb-orbits">
          {RINGS.map((r) => (
            <circle key={r} cx="800" cy="300" r={r} />
          ))}
        </g>
        <circle className="hb-horizon" cx="800" cy="300" r="165" />
        <circle className="hb-spin" cx="800" cy="300" r="225" />
        <line className="hb-axis" x1="0" y1="300" x2="1600" y2="300" />
      </svg>

      <div className="hb-top">
        <span className="hb-tag mono">Event horizon readout</span>
        <span className="hb-tag mono">Runs per player</span>
      </div>
      <b className="hb-fig">{runs.toLocaleString()}</b>
      <p className="hb-cap">
        Every player, simulated <em>{runs.toLocaleString()}</em> times. Where those outcomes land is the floor, the median and the ceiling.
      </p>

      <div className="hb-ruler" aria-hidden="true">
        <div className="hb-ticks" />
        <div className="hb-nums mono">
          {labels.map((l, i) => (
            <span key={i} className={i === labels.length - 1 ? "end" : ""}>{l}</span>
          ))}
        </div>
      </div>

      <ul className="hb-cells">
        {cells.map((c) => (
          <li key={c.v}>
            <b>{c.k}</b>
            <span>{c.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

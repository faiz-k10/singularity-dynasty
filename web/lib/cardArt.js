import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { curveGeometry, hump, MARGIN, BASE_Y, X_FLOOR, fmt } from "@/lib/scoreCurve";
import { logoFile } from "@/app/tools/TeamBadge";
import { BYE_LABEL } from "@/lib/bye";
import { fmt1, signed1 } from "@/lib/format";

// Server-only: the share-card PICTURES (next/og -> Satori: flexbox and a subset of CSS, every multi-child box needs display:flex).
// Two sizes from one layout: "wide" 1200 x 630 is what X, Reddit, Discord, Facebook, LinkedIn and Bluesky show for a link; "tall"
// 1080 x 1350 is the Instagram feed shape, for downloading. Colours are the Europa dark theme's tokens (app/globals.css), fonts are the
// site's display and mono faces (TTF copies in assets/og-fonts, OFL), so a card reads as the site.

export const SIZES = { wide: { width: 1200, height: 630 }, tall: { width: 1080, height: 1350 } };
export const sizeOf = (f) => (f === "tall" ? "tall" : "wide");

const C = { void: "#030908", panel: "#09130F", panel2: "#0D1B17", rule: "#1A2A26", star: "#E6F4F1", steel: "#8C95A3", mint: "#2DD4BF", red: "#E11D48", onBrand: "#021210" };
// Badge medallion colours, dark theme (globals.css --cape, --fire, ...); Established keeps the old gold.
const BADGE = {
  gold: "#FFC773", silver: "#A0AAB9", rookie: "#BF8A5C", boulder: "#869550", cloud: "#EBADB7", heat: "#FF2400", ice: "#4F8EF7", icarus: "#A78BFA", eddy: "#4ADE80", sprout: "#A3E635",
  peak: "#FACC15", smash: "#FF7A45", tough: "#3DDCFF", honorable: "#2DD4BF", menace: "#E879F9", eliteRole: "#D9648C", elitePlayer: "#7283EE", plusValue: "#DEF994", minusValue: "#8D47F5", ball: "#E6F4F1",
};
export const SPOT = { SMASH: BADGE.smash, AVOID: BADGE.tough };
const DISPLAY = "Big Shoulders";
const MONO = "Martian Mono";

let fontsP = null;
function fonts() {
  const dir = join(process.cwd(), "assets/og-fonts");
  fontsP ??= Promise.all([readFile(join(dir, "BigShoulders-800.ttf")), readFile(join(dir, "MartianMono-400.ttf")), readFile(join(dir, "MartianMono-700.ttf"))])
    .then(([d, m4, m7]) => [
      { name: DISPLAY, data: d, weight: 800, style: "normal" },
      { name: MONO, data: m4, weight: 400, style: "normal" },
      { name: MONO, data: m7, weight: 700, style: "normal" },
    ])
    .catch((e) => {
      fontsP = null;
      throw e;
    });
  return fontsP;
}

const logos = new Map();
export async function teamLogo(team) {
  const file = logoFile(team);
  if (!file) return null;
  if (!logos.has(file)) logos.set(file, readFile(join(process.cwd(), "public/team-logos", `${file}-dark.png`)).then((b) => `data:image/png;base64,${b.toString("base64")}`).catch(() => null));
  return logos.get(file);
}

// A player photo as a data URI (2.5s at most; a card without a photo is fine, a card that never answers is not). The type is read from the
// file itself: Sleeper's thumbnails are PNGs served as image/jpeg, and Satori draws only PNG and JPEG.
export async function photo(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : null;
    return type ? `data:${type};base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}

// What an image request asks for: the size (?f=tall), a download name (?dl=name -> saved as name-tall.png) and the host to print on the card.
export function cardRequest(request) {
  const u = new URL(request.url);
  const dl = (u.searchParams.get("dl") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  return { f: sizeOf(u.searchParams.get("f")), dl: dl || null, host: request.headers.get("x-forwarded-host") || u.host };
}

// Answers the picture. `cache`: how long the CDN may keep it (a past week never changes; the current one can be republished).
export async function cardImage(node, { f, dl }, { cache = 3600 } = {}) {
  const size = SIZES[sizeOf(f)];
  const headers = { "Cache-Control": `public, max-age=600, s-maxage=${cache}, stale-while-revalidate=86400` };
  if (dl) headers["Content-Disposition"] = `attachment; filename="${dl}-${sizeOf(f)}.png"`;
  return new ImageResponse(node, { ...size, fonts: await fonts(), headers });
}


// ---- building blocks -------------------------------------------------------------------------------------------------------------------------

export function Frame({ f, eyebrow, host, tool, children }) {
  const tall = sizeOf(f) === "tall";
  const pad = tall ? 64 : 52;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.void, color: C.star, fontFamily: MONO, borderTop: `8px solid ${C.mint}`, padding: `${pad - 14}px ${pad}px ${pad - 18}px` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 17, display: "flex", borderStyle: "solid", borderWidth: 6, borderTopColor: C.mint, borderLeftColor: C.mint, borderRightColor: C.red, borderBottomColor: C.red, transform: "rotate(-45deg)" }} />
          <div style={{ display: "flex", marginLeft: 14, fontFamily: DISPLAY, fontSize: tall ? 34 : 30, letterSpacing: 5, textTransform: "uppercase" }}>Singularity Dynasty</div>
        </div>
        {eyebrow && <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", background: C.mint, color: C.onBrand, fontWeight: 700, fontSize: tall ? 20 : 18, letterSpacing: 2, padding: "7px 14px", textTransform: "uppercase" }}>{eyebrow}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginTop: tall ? 40 : 26 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.rule}`, paddingTop: 14, fontSize: tall ? 19 : 17, color: C.steel, letterSpacing: 1 }}>
        <div style={{ display: "flex" }}>{host}</div>
        <div style={{ display: "flex", textTransform: "uppercase" }}>{tool}</div>
      </div>
    </div>
  );
}

const Label = ({ children, color = C.steel, size = 17, style }) => (
  <div style={{ display: "flex", fontSize: size, letterSpacing: 2, textTransform: "uppercase", color, ...style }}>{children}</div>
);
const Plate = ({ children, color = C.mint, ink = C.onBrand, size = 18 }) => (
  <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", background: color, color: ink, fontWeight: 700, fontSize: size, padding: "5px 11px", marginRight: 10, letterSpacing: 1 }}>{children}</div>
);
const Hair = ({ children, size = 18, color = C.star }) => (
  <div style={{ display: "flex", border: `2px solid ${C.rule}`, color, fontSize: size, padding: "4px 11px", marginRight: 10, letterSpacing: 1 }}>{children}</div>
);

export function Badges({ badges, max = 4, size = 17 }) {
  const list = (badges || []).slice(0, max);
  if (!list.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {list.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", border: `2px solid ${C.rule}`, padding: "5px 12px", marginRight: 10, marginBottom: 10, fontSize: size }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: BADGE[b.variant] || C.steel, marginRight: 9, display: "flex" }} />
          {b.label}
        </div>
      ))}
    </div>
  );
}

// The outcome curve, as on Weekly Projection Rankings: mint wedge under the floor, the steel hump peaking at the median, red wedge over the
// ceiling (lib/scoreCurve.js geometry), stretched to the card, with floor / median / ceiling written under it in their zone's colour.
const CW = 300;
export function Curve({ floor, median, ceiling, width, height, labels = true, size = 22 }) {
  if (![floor, median, ceiling].every((v) => typeof v === "number" && Number.isFinite(v)) || !(ceiling > floor)) return null;
  const { xPeak, tailY, xCeil } = curveGeometry(floor, median, ceiling, CW);
  const mid = [...hump(xPeak, X_FLOOR).reverse(), ...hump(xPeak, xCeil).slice(1)];
  const middle = `M${fmt(mid[0][0], BASE_Y)} L${mid.map(([x, y]) => fmt(x, y)).join(" L")} L${fmt(mid.at(-1)[0], BASE_Y)} Z`;
  const lo = `M${fmt(X_FLOOR, BASE_Y)} L${fmt(X_FLOOR, tailY)} L${fmt(MARGIN, BASE_Y)} Z`;
  const hi = `M${fmt(xCeil, BASE_Y)} L${fmt(xCeil, tailY)} L${fmt(CW - MARGIN, BASE_Y)} Z`;
  const top = 5;
  const sx = width / CW;
  const at = (x) => Math.round(x * sx);
  // Each number hangs under its point: the floor's left edge, the median's centre, the ceiling's right edge. (No undefined style values:
  // Satori can't read them.)
  const place = (x, align) =>
    align === "start" ? { left: Math.max(0, at(x) - 6) } : align === "end" ? { right: Math.max(0, width - at(x) - 6) } : { left: at(x) - 90, width: 180 };
  const tag = (x, value, word, color, align) => (
    <div style={{ position: "absolute", ...place(x, align), display: "flex", flexDirection: "column", alignItems: align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center" }}>
      <div style={{ display: "flex", fontWeight: 700, fontSize: size + 8, color }}>{fmt1(value)}</div>
      <div style={{ display: "flex", fontSize: size - 6, letterSpacing: 2, color: C.steel }}>{word}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <svg width={width} height={height} viewBox={`0 ${top} ${CW} ${BASE_Y - top + 1}`} preserveAspectRatio="none">
        <path d={lo} fill={C.red} fillOpacity="0.85" />
        <path d={hi} fill={C.mint} fillOpacity="0.85" />
        <path d={middle} fill={C.steel} fillOpacity="0.32" stroke={C.steel} strokeWidth="0.8" />
        <line x1={xPeak} x2={xPeak} y1={7} y2={BASE_Y} stroke={C.star} strokeOpacity="0.5" strokeWidth="0.6" />
        <line x1={MARGIN} x2={CW - MARGIN} y1={BASE_Y} y2={BASE_Y} stroke={C.rule} strokeWidth="1" />
      </svg>
      {labels && (
        <div style={{ display: "flex", position: "relative", height: size * 2 + 22, marginTop: 10 }}>
          {tag(X_FLOOR, floor, "FLOOR", C.red, "start")}
          {tag(xPeak, median, "MEDIAN", C.star, "middle")}
          {tag(xCeil, ceiling, "CEILING", C.mint, "end")}
        </div>
      )}
    </div>
  );
}

function Photo({ src, size }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> from a data URI
  return <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", borderRadius: 2, border: `2px solid ${C.rule}`, background: C.panel2 }} alt="" />;
}
function Logo({ src, size }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> from a data URI
  return <img src={src} width={size} height={size} style={{ width: size, height: size }} alt="" />;
}

// A name's font size so it fits `room` px on one line (Big Shoulders 800 capitals run about 0.5em a character), never above `max`.
const nameSize = (name, room, max) => Math.min(max, Math.floor(room / (Math.max(name.length, 4) * 0.5)));

const matchupText = (p) => (p.bye ? BYE_LABEL : p.opponent ? `${p.isHome ? "vs" : "@"} ${p.opponent}` : "");
const spotText = (lean) => (lean ? `${lean.call === "SMASH" ? "SMASH SPOT" : "TOUGH SPOT"} ${signed1(lean.effect)}` : null);

// ---- the cards ---------------------------------------------------------------------------------------------------------------------------------

// One player's week (Weekly Projection Rankings).
export function PlayerCard({ f, host, data, img }) {
  const { player: p, week, season } = data;
  const tall = sizeOf(f) === "tall";
  const name = (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Photo src={img.photo} size={tall ? 150 : 118} />
      <div style={{ display: "flex", flexDirection: "column", marginLeft: img.photo ? 24 : 0, maxWidth: tall ? 760 : 470 }}>
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: nameSize(p.name, (tall ? 760 : 470) - (img.photo ? (tall ? 174 : 142) : 0), tall ? 92 : 68), lineHeight: 0.95, textTransform: "uppercase", letterSpacing: 1 }}>{p.name}</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 12, fontSize: tall ? 24 : 20, color: C.steel }}>
          <Logo src={img.logo} size={tall ? 40 : 34} />
          <div style={{ display: "flex", marginLeft: img.logo ? 10 : 0 }}>{`${p.pos} · ${p.team || "FA"} · ${matchupText(p)}`}</div>
        </div>
      </div>
    </div>
  );
  const chips = (
    <div style={{ display: "flex", marginTop: tall ? 30 : 22 }}>
      {p.posLabel && !p.bye && <Plate size={tall ? 22 : 19}>{p.posLabel}</Plate>}
      {p.rank != null && !p.bye && <Hair size={tall ? 22 : 19}>{`#${p.rank} OVERALL`}</Hair>}
      {spotText(p.lean) && <Plate color={SPOT[p.lean.call]} ink={C.void} size={tall ? 22 : 19}>{spotText(p.lean)}</Plate>}
    </div>
  );
  const noRange = p.bye ? "His team is on its bye this week." : p.out ? "Listed out this week." : null;
  const number = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Label size={tall ? 20 : 17}>{p.played != null ? `Projected · scored ${fmt1(p.played)} so far` : "Projected points"}</Label>
      <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 210 : 150, lineHeight: 0.95, color: noRange ? C.steel : C.mint }}>{noRange ? (p.bye ? "BYE" : "OUT") : fmt1(p.projection)}</div>
    </div>
  );
  const curve = noRange ? (
    <div style={{ display: "flex", fontSize: tall ? 26 : 22, color: C.steel, marginTop: 20 }}>{noRange}</div>
  ) : (
    <Curve floor={p.floor} median={p.projection} ceiling={p.ceiling} width={tall ? 952 : 510} height={tall ? 230 : 150} size={tall ? 26 : 21} />
  );
  return (
    <Frame f={f} host={host} tool="Weekly Projection Rankings" eyebrow={`Week ${week} · ${season}`}>
      {tall ? (
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          {name}
          {chips}
          <div style={{ display: "flex", marginTop: 34 }}>
            <Badges badges={p.badges} max={6} size={21} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: 30 }}>
            {number}
            <div style={{ display: "flex", marginTop: 24 }}>{curve}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexGrow: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 500 }}>
            {name}
            {chips}
            <div style={{ display: "flex", marginTop: "auto", marginBottom: 14 }}>
              <Badges badges={p.badges} max={4} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginLeft: 40, borderLeft: `2px solid ${C.rule}`, paddingLeft: 36 }}>
            {number}
            <div style={{ display: "flex", marginTop: 14 }}>{curve}</div>
          </div>
        </div>
      )}
    </Frame>
  );
}

// One player's dynasty value (the Dynasty Draft Board's Rankings tab).
export function DynastyCard({ f, host, data, img }) {
  const { player: p } = data;
  const tall = sizeOf(f) === "tall";
  const big = tall ? 220 : 160;
  const prodPart = Math.max(0, data.weights.prod * p.prod);
  const agePart = Math.max(0, data.weights.age * p.ageValue);
  const tot = prodPart + agePart || 1;
  const barW = tall ? 952 : 510;
  return (
    <Frame f={f} host={host} tool="Dynasty Draft Board" eyebrow={`Dynasty · ${data.format === "Superflex" ? "SF" : data.format} · ${data.mode}`}>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", flexGrow: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", width: tall ? "100%" : 500 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Photo src={img.photo} size={tall ? 150 : 118} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: img.photo ? 24 : 0, maxWidth: tall ? 760 : 470 }}>
              <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: nameSize(p.name, (tall ? 760 : 470) - (img.photo ? (tall ? 174 : 142) : 0), tall ? 92 : 68), lineHeight: 0.95, textTransform: "uppercase", letterSpacing: 1 }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 12, fontSize: tall ? 24 : 20, color: C.steel }}>
                <Logo src={img.logo} size={tall ? 40 : 34} />
                <div style={{ display: "flex", marginLeft: img.logo ? 10 : 0 }}>{`${p.pos} · ${p.team || "FA"} · ${p.age.toFixed(1)} yrs`}</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: tall ? 30 : 22 }}>
            <Plate size={tall ? 22 : 19}>{`${p.pos}${p.posRank}`}</Plate>
            <Hair size={tall ? 22 : 19}>{`#${p.rank} OVERALL`}</Hair>
            {p.tier && <Hair size={tall ? 22 : 19} color={C.mint}>{`TIER ${p.tier.n} OF ${p.tier.of}`}</Hair>}
          </div>
          {p.tier?.group && <Label size={tall ? 22 : 18} color={C.mint} style={{ marginTop: 18 }}>{p.tier.group}</Label>}
          <div style={{ display: "flex", marginTop: tall ? 22 : "auto", marginBottom: 14, fontSize: tall ? 22 : 18, color: C.steel }}>{`${fmt1(p.ppg)} PPR points a game, recency-weighted over his last ${Math.min(p.games, 34)} games`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", ...(tall ? { marginTop: "auto", marginBottom: 40 } : { flexGrow: 1, marginLeft: 40, borderLeft: `2px solid ${C.rule}`, paddingLeft: 36 }) }}>
          <Label size={tall ? 20 : 17}>Dynasty score · 1 to 10</Label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: big, lineHeight: 0.95, color: C.mint }}>{p.score.toFixed(1)}</div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 22, marginBottom: 22, fontSize: tall ? 22 : 18, color: C.steel }}>
              <div style={{ display: "flex" }}>80% range</div>
              <div style={{ display: "flex", color: C.star, fontWeight: 700 }}>{`${p.lo.toFixed(1)} – ${p.hi.toFixed(1)}`}</div>
            </div>
          </div>
          <Label size={tall ? 20 : 16} style={{ marginTop: tall ? 40 : 24 }}>The recipe</Label>
          <div style={{ display: "flex", width: barW, height: tall ? 30 : 22, marginTop: 10, background: C.panel2 }}>
            <div style={{ display: "flex", width: Math.round((prodPart / tot) * barW), background: C.mint }} />
            <div style={{ display: "flex", flexGrow: 1, background: C.steel }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", width: barW, marginTop: 10, fontSize: tall ? 22 : 17 }}>
            <div style={{ display: "flex", color: C.mint }}>{`Production ${fmt1(p.prod)} × ${data.weights.prod}`}</div>
            <div style={{ display: "flex", color: C.steel }}>{`Age ${fmt1(p.ageValue)} × ${data.weights.age}`}</div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// Start / sit between two players (Compare Players).
export function StartSitCard({ f, host, data, img }) {
  const { a, b, pick, gain, week, season, neither } = data;
  const tall = sizeOf(f) === "tall";
  const side = (p, im, chosen) => (
    <div style={{ display: "flex", flexDirection: "column", width: tall ? 952 : 500, padding: tall ? 24 : 20, border: `2px solid ${chosen ? C.mint : C.rule}`, background: chosen ? "rgba(45,212,191,0.07)" : C.panel }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Photo src={im.photo} size={tall ? 92 : 74} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: im.photo ? 16 : 0, maxWidth: tall ? 760 : 370 }}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: nameSize(p.name, tall ? 700 : 360, tall ? 54 : 46), lineHeight: 0.95, textTransform: "uppercase" }}>{p.name}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 8, fontSize: tall ? 19 : 16, color: C.steel }}>
            <Logo src={im.logo} size={tall ? 30 : 26} />
            <div style={{ display: "flex", marginLeft: im.logo ? 8 : 0 }}>{`${p.posLabel || p.pos} · ${matchupText(p)}`}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", marginTop: tall ? 14 : 16 }}>
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 100 : 84, lineHeight: 0.95, color: p.bye || p.out ? C.steel : chosen ? C.mint : C.star }}>{p.bye ? "BYE" : p.out ? "OUT" : fmt1(p.projection)}</div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 14, marginBottom: 10 }}>
          {!(p.bye || p.out) && <Label size={tall ? 16 : 13}>Median</Label>}
          {spotText(p.lean) && <div style={{ display: "flex", marginTop: 6, fontSize: tall ? 17 : 14, fontWeight: 700, color: SPOT[p.lean.call] }}>{spotText(p.lean)}</div>}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: tall ? 22 : 12 }}>
        <Curve floor={p.floor} median={p.projection} ceiling={p.ceiling} width={tall ? 900 : 456} height={tall ? 110 : 70} size={tall ? 20 : 15} />
      </div>
    </div>
  );
  const pA = pick === "a", pB = pick === "b";
  const winner = pA ? a : pB ? b : null;
  return (
    <Frame f={f} host={host} tool="Compare Players" eyebrow={`Start / sit · Week ${week} · ${season}`}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", flexDirection: tall ? "column" : "row", justifyContent: "space-between", alignItems: tall ? "center" : "stretch" }}>
          {side(a, img.a, pA)}
          <div style={{ display: "flex", alignItems: "center", fontFamily: DISPLAY, fontSize: tall ? 40 : 36, color: C.steel, margin: tall ? "8px 0" : 0 }}>VS</div>
          {side(b, img.b, pB)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", marginBottom: tall ? 26 : 12, background: winner ? C.mint : C.panel2, color: winner ? C.onBrand : C.star, padding: tall ? "20px 26px" : "13px 22px" }}>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 50 : 40, textTransform: "uppercase", letterSpacing: 1 }}>{winner ? `Start ${winner.name}` : neither ? "Neither plays" : "Coin flip"}</div>
          <div style={{ display: "flex", fontSize: tall ? 20 : 16, fontWeight: 700 }}>{winner ? (a.bye || a.out || b.bye || b.out ? "the other isn't playing" : `+${gain.toFixed(1)} projected`) : neither ? "both off this week" : "within 0.1 points"}</div>
        </div>
        <div style={{ display: "flex", fontSize: tall ? 17 : 13, color: C.steel, marginBottom: 6 }}>Median plus the Smash / Tough Spot effect: the two inputs that picked the higher scorer most often in our backtest.</div>
      </div>
    </Frame>
  );
}

// Last week's track record (/receipts).
export function ReceiptsCard({ f, host, data, verdict }) {
  const tall = sizeOf(f) === "tall";
  const stat = (pct, target, word, color) => (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, borderTop: `4px solid ${color}`, paddingTop: 12, marginRight: 22 }}>
      <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 150 : 92, lineHeight: 0.95, color }}>{`${pct == null ? "—" : pct.toFixed(0)}%`}</div>
      <div style={{ display: "flex", fontSize: tall ? 21 : 17, marginTop: 6 }}>{word}</div>
      <div style={{ display: "flex", fontSize: tall ? 18 : 15, color: C.steel, marginTop: 4 }}>{`aim: ${target}%`}</div>
    </div>
  );
  const spot = (s, call) => {
    if (!s.n) return null;
    const smash = call === "SMASH";
    return (
      <div style={{ display: "flex", alignItems: "center", marginTop: tall ? 18 : 10, fontSize: tall ? 23 : 18 }}>
        <Plate color={SPOT[call]} ink={C.void} size={tall ? 19 : 15}>{smash ? "SMASH SPOTS" : "TOUGH SPOTS"}</Plate>
        <div style={{ display: "flex" }}>{`${s.hits} of ${s.n} ${smash ? "beat" : "fell short of"} their median · ${signed1(s.vsMedian)} pts on average`}</div>
      </div>
    );
  };
  const games = data.ceilingGames.slice(0, tall ? 3 : 2);
  return (
    <Frame f={f} host={host} tool="Track record" eyebrow={`Receipts · Week ${data.week} · ${data.season}`}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 66 : 50, lineHeight: 1, textTransform: "uppercase" }}>How our ranges held up</div>
        <div style={{ display: "flex", fontSize: tall ? 21 : 17, color: C.steel, marginTop: 10 }}>{`${data.n} players projected for 5+ points who played · ${verdict}`}</div>
        <div style={{ display: "flex", marginTop: tall ? 44 : 26 }}>
          {stat(data.inside.pct, 80, "landed inside the range", C.steel)}
          {stat(data.over.pct, 10, "beat their ceiling", C.mint)}
          {stat(data.under.pct, 10, "fell under their floor", C.red)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 40 : 20 }}>
          {spot(data.smash, "SMASH")}
          {spot(data.tough, "AVOID")}
        </div>
        {!tall && games[0] && (
          <div style={{ display: "flex", marginTop: "auto", marginBottom: 10, fontSize: 17, color: C.steel }}>
            {`Biggest ceiling game: ${games[0].name} · ceiling ${fmt1(games[0].ceiling)} → `}
            <span style={{ color: C.mint, fontWeight: 700, marginLeft: 8 }}>{fmt1(games[0].pts)}</span>
          </div>
        )}
        {tall && games.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: 30 }}>
            <Label size={19}>Biggest ceiling games</Label>
            {games.map((g) => (
              <div key={g.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 23, borderBottom: `2px solid ${C.rule}`, padding: "12px 0" }}>
                <div style={{ display: "flex" }}>{`${g.name} · ${g.pos}`}</div>
                <div style={{ display: "flex", color: C.steel }}>
                  {`ceiling ${fmt1(g.ceiling)} → `}
                  <span style={{ color: C.red, fontWeight: 700, marginLeft: 8 }}>{fmt1(g.pts)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}

// This week's Smash Spots and Tough Spots (/smash).
export function SmashCard({ f, host, data }) {
  const tall = sizeOf(f) === "tall";
  const n = tall ? 5 : 4;
  const col = (list, call) => (
    <div style={{ display: "flex", flexDirection: "column", ...(tall ? { flexShrink: 0, marginBottom: 40 } : { flexGrow: 1, flexBasis: 0, marginRight: 30 }) }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: `4px solid ${SPOT[call]}`, paddingBottom: 8 }}>
        <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 50 : 40, color: SPOT[call], textTransform: "uppercase" }}>{call === "SMASH" ? "Smash Spots" : "Tough Spots"}</div>
      </div>
      {list.length === 0 && <div style={{ display: "flex", fontSize: 18, color: C.steel, marginTop: 14 }}>None this week</div>}
      {list.slice(0, n).map((s) => (
        <div key={`${s.defense}${s.position}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${C.rule}`, padding: tall ? "14px 0" : "9px 0" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: tall ? 25 : 20, fontWeight: 700 }}>{`${s.offense} ${s.position}s vs ${s.defense}`}</div>
            {s.players.length > 0 && <div style={{ display: "flex", fontSize: tall ? 18 : 14, color: C.steel, marginTop: 3 }}>{s.players.map((p) => p.name).join(" · ")}</div>}
          </div>
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: tall ? 44 : 34, color: SPOT[call] }}>{signed1(s.effect)}</div>
        </div>
      ))}
    </div>
  );
  return (
    <Frame f={f} host={host} tool="Weekly Projection Rankings" eyebrow={`Matchups · Week ${data.week} · ${data.season}`}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", flexDirection: tall ? "column" : "row", flexGrow: 1 }}>
          {col(data.smash, "SMASH")}
          {col(data.tough, "AVOID")}
        </div>
        <div style={{ display: "flex", fontSize: tall ? 18 : 13, color: C.steel, marginBottom: 6 }}>Defense-vs-position trends, opponent-adjusted, in fantasy points a game vs an average defense. A trend to weigh, not part of the projection.</div>
      </div>
    </Frame>
  );
}

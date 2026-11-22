"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ShareDialog from "../../ShareDialog";
import { seeFinds, pickPlayer, claim, wearSkin, freePick, pickSkin } from "./actions";
import { SkyBackdrop, CoreSkin, SkinPreview } from "./skins";
import { StarField, Galaxies, Scrim, LitStar, GlowLine, Bloom, StarSurface } from "./hubble";
import { placeFind } from "@/lib/skyPlacement";
import { drawObject, skyObject, sharpen, findCard, receiptCard, seasonCard, toBlob, setCardBadge, setCardSkin, setCardFrame } from "./skyArt";
import {
  ACTIONS, loreFor, skyFor, SKINS, RARITY, hasSkin, equipped, skySkinsFor, FAMILIES, COLOURS, VERSIONS, TIER_NAME, POWERUPS, LADDER, rungLabel, CATALOGUE_SIZE, SET_COUNT, UNLOCK, EVENT_TEXT,
  famsIn, findOf, setProgress, seasonProgress, coreSkinsFor, pickOptions, pickTiers, pickLabel, skinChoiceOptions, hasTelescope,
} from "@/lib/nightSky";

// The Night Sky page (server side: page.js; rules: lib/nightSky.js). Everything here only SHOWS the sky: stars, finds and points are decided on
// the server, and the three things a member does here (open finds, pick, claim) go through ./actions.

// Star colours follow the theme (white stars are ink on the light sky, gold a deeper amber): --sky-* in globals.css. Share cards keep the
// dark-sky hexes (COLORS in lib/nightSky.js).
const STAR = { blue: "var(--sky-blue)", ember: "var(--sky-ember)", white: "var(--sky-white)", gold: "var(--sky-gold)", lucky: "var(--sky-gold)" };

// The field of stars and distant galaxies is the Hubble kit (./hubble.js).

// The core's four stages. Cool / warming / unstable follow its mass (the same thresholds the page has always named); collapsed = a find is
// waiting for the telescope. The gauge has one tick per unit of mass (12 shown), coloured by the band it sits in.
const STAGES = [
  { id: "cool", label: "Cool", from: 0 },
  { id: "warming", label: "Warming", from: 4 },
  { id: "unstable", label: "Unstable", from: 8 },
];
const stageOf = (mass) => [...STAGES].reverse().find((st) => mass >= st.from);
function Core({ mass, collapsed, skin }) {
  const m = Math.min(12, Math.max(0, mass || 0)), st = collapsed ? { id: "collapsed", label: "Collapsed" } : stageOf(m);
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = ((-90 + i * 30) * Math.PI) / 180, band = i < 3 ? "cool" : i < 7 ? "warming" : "unstable";
    const r2 = (v) => Math.round(v * 100) / 100; // the same digits on the server and in the browser
    return { x1: r2(Math.cos(a) * 74), y1: r2(Math.sin(a) * 74), x2: r2(Math.cos(a) * 84), y2: r2(Math.sin(a) * 84), lit: collapsed || i < m, band };
  });
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <g className={`sky-core is-${st.id} skin-${skin}`}>
      <Bloom r={190} id={gid} />
      <circle className="sky-core-glow" r="70" />
      {ticks.map((t, i) => <line key={i} className={`sky-core-tick${t.lit ? ` is-lit is-${t.band}` : ""}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
      <circle className="sky-core-debris" r="62" />
      <CoreSkin skin={skin} layer="back" />
      <circle className="sky-core-rim" r="54" />
      <circle className="sky-core-body" r="44" />
      {/* a living star: limb-darkened, granulated, with a corona (dark theme only) */}
      <StarSurface r={44} id={gid} className="sky-core-shine" />
      <CoreSkin skin={skin} layer="front" />
      {collapsed && <circle className="sky-core-lens" r="49" />}
      {/* no plate: the words sit on the sky with a soft shadow (founder, Nov 17 2026: the black boxes looked out of place) */}
      {/* at the bottom of the sky the whole line is centred, under the picks (founder, Nov 17 2026). While a find is waiting the
          telescope button below the sky says so, in this same spot, so the line steps aside (founder, Nov 18 2026: "this is messy") */}
      {!collapsed && (
        <g className="sky-label">
          <text className="sky-heat" x="0" y="284" textAnchor="middle">
            {STAGES.map((x, i) => (
              <tspan key={x.id} className={x.id === st.id ? "is-on" : ""}>{i ? "  ·  " : ""}{x.label}</tspan>
            ))}
          </text>
        </g>
      )}
    </g>
  );
}

// The member's rarest find, hung in the sky where its kind belongs (lib/skyPlacement.js): clear of every constellation, its label and the
// core's words. The picture is drawn in the browser, so it appears just after the sky does.
function RarestInSky({ state }) {
  const rarest = useMemo(() => Object.values(state.found).sort((a, b) => b.oneIn - a.oneIn)[0] || null, [state.found]);
  const place = useMemo(() => {
    if (!rarest) return null;
    const sky = pageSky(state.season);
    const avoid = [[-200, 240, 200, 300], [-92, 178, 92, 260], /* the heat line or the telescope button; the picks, raised or not */ ...sky.map((c) => {
      const lx = Math.sign(c.label[0]) * 456, ly = c.label[1];
      return lx > 0 ? [lx - 175, ly - 14, lx, ly + 20] : [lx, ly - 14, lx + 175, ly + 20];
    })];
    return placeFind(rarest.fam, sky, { w: 960, h: 600, avoid, stretch: 1.5 });
  }, [rarest, state.season]);
  const img = useRef(null);
  useEffect(() => { if (rarest && place && img.current) img.current.setAttribute("href", skyObject(rarest, Math.round(place.size * 1.45 * 3), place.rot).toDataURL()); }, [rarest, place]);
  const still = useReducedMotion();
  if (!place) return null;
  const art = place.size * 1.45, shape = FAMILIES[rarest.fam].shape, { x, y } = place;
  const m = still ? {} : MOTION[shape] || MOTION.planet;
  // SMIL animation (not CSS): it turns about real sky coordinates -- the core for an orbit, the object's own centre for a spin or a pulse
  return (
    <g className="sky-rarest" aria-label={`Your rarest find: ${rarest.name}`}>
      {place.orbit && <circle r={place.orbit} className={place.belt ? "sky-orbit is-belt" : "sky-orbit"} />}
      <g>
        {m.orbit && <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur={`${m.orbit}s`} repeatCount="indefinite" />}
        {m.wander && <animateTransform attributeName="transform" type="translate" values={`0 0; ${m.wander} ${-m.wander / 2}; ${-m.wander / 2} ${m.wander}; 0 0`} dur={`${m.wanderDur}s`} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1; .45 0 .55 1; .45 0 .55 1" />}
        <g>
          {m.spin && <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`${m.spin > 0 ? 360 : -360} ${x} ${y}`} dur={`${Math.abs(m.spin)}s`} repeatCount="indefinite" />}
          <g transform={`translate(${x} ${y})`}>
            <g>
              {m.pulse && <animateTransform attributeName="transform" type="scale" values={`1; ${m.pulse}; 1`} dur={`${m.pulseDur}s`} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1; .45 0 .55 1" />}
              <image ref={img} x={-art / 2} y={-art / 2} width={art} height={art}>
                {m.flicker && <animate attributeName="opacity" values={m.flicker} dur={`${m.flickerDur}s`} repeatCount="indefinite" />}
              </image>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

// How the rarest find moves (founder, Nov 17 2026: "add motion to the object", then "I don't see it moving" -- the first version only
// swayed 4 degrees over 48s): anything on an orbit really goes round the core (a planet keeps its lit side toward it, a comet its tail
// away, because the whole picture turns with the orbit), rocks also tumble, rogue planets wander, meteor showers twinkle, exploding stars
// breathe, pulsars flicker, black holes and quasars turn their disks, nebulae swell. `orbit` = seconds per lap. Still for anyone who
// asks their device for reduced motion.
const LAP = { orbit: 60 };
const MOTION = {
  planet: LAP, banded: LAP, ringed: { orbit: 70 }, lava: { orbit: 45 }, locked: { orbit: 50 }, diamond: { ...LAP, pulse: 1.08, pulseDur: 4 }, moon: LAP,
  rock: { orbit: 90, spin: 14 }, rubble: { orbit: 90, spin: 20 }, twin: { orbit: 90, spin: -16 }, dust: { orbit: 90, pulse: 1.1, pulseDur: 6 },
  comet: { orbit: 80, flicker: "1;.7;1;.85;1", flickerDur: 2.4 },
  dwarf: { orbit: 120 },
  rogue: { wander: 30, wanderDur: 24 },
  shower: { flicker: ".35;1;.55;1;.35", flickerDur: 2 },
  supernova: { pulse: 1.16, pulseDur: 4 }, star: { pulse: 1.12, pulseDur: 5, flicker: "1;.75;1", flickerDur: 5 },
  pulsar: { flicker: "1;.35;1", flickerDur: 0.9 }, blackhole: { spin: 30 }, quasar: { spin: -40, flicker: "1;.7;1", flickerDur: 3 },
  nebula: { pulse: 1.09, pulseDur: 8 },
};
const subscribeMotion = (cb) => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

// The season's constellations as the PAGE draws them (founder, Nov 18 2026: the telescope button sat on a star of Orion): the sky panel is
// a wide landscape (+-480 across) while the constellations are laid out in a square (+-256), so each one is shifted SPREAD units further out
// to its own side -- every star then sits at least 228 from the centre line, clear of the centred telescope button and the words under the
// core. The share card's square sky keeps the original layout.
const SPREAD = 120;
const spreadCache = new Map();
function pageSky(season) {
  if (!spreadCache.has(season)) spreadCache.set(season, skyFor(season).map((c) => ({ ...c, pts: c.pts.map(([x, y, r]) => [x + Math.sign(x) * SPREAD, y, r]) })));
  return spreadCache.get(season);
}

// Memoised (Nov 17 2026 performance pass): the sky is the heaviest thing on the page (hundreds of stars, skins with noise filters), so it
// redraws only when its own data changes -- not on the boost timers, menus or messages around it. `picks` is a count so the props compare.
const Sky = memo(function Sky({ state, picks, pending }) {
  const fid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const open = state.findsTotal >= UNLOCK.constellations;
  const lift = pending ? 40 : 0; // while the telescope button sits at the bottom of the sky, the picks waiting move up out of its way
  return (
    <svg className="sky-svg" viewBox="-480 -300 960 600" role="img" aria-label={`Your sky: ${state.findsTotal} finds, the core ${pending ? "collapsed" : stageOf(state.mass).label.toLowerCase()}`}>
      <SkyBackdrop skin={equipped(state).sky} />
      <Galaxies id={fid} seed={31} n={19} w={960} />
      <StarField seed={7} n={270} w={960} />
      <Scrim id={fid} />
      {/* the glow under a finished constellation's name: an SVG blur (not a CSS filter -- Safari ignores CSS filters on SVG text) */}
      <defs>
        <filter id={`${fid}nameglow`} x="-30%" y="-250%" width="160%" height="600%">
          <feGaussianBlur stdDeviation="2" result="tight" />
          <feGaussianBlur stdDeviation="6" result="wide" />
          <feMerge><feMergeNode in="wide" /><feMergeNode in="wide" /><feMergeNode in="tight" /><feMergeNode in="tight" /><feMergeNode in="tight" /></feMerge>
        </filter>
      </defs>
      {pageSky(state.season).map((c) => {
        const f = state.filled[c.id] || [];
        if (!open) return <g key={c.id}>{c.pts.map(([x, y], i) => f[i] ? <circle key={i} cx={x} cy={y} r={3} fill="var(--star)" /> : null)}</g>;
        const have = f.filter(Boolean).length, done = have === c.pts.length;
        const [cx0, ly, anchor] = c.label;
        const lx = Math.sign(cx0) * 456; // pushed out to the corners of the landscape frame (founder, Nov 17 2026)
        return (
          <g key={c.id} className={done ? "sky-const is-done" : "sky-const"} style={{ "--c": STAR[c.color] }}>
            {c.edges.map(([i, j]) => {
              const lit = f[i] && f[j];
              return lit
                ? <GlowLine key={`l${i}-${j}`} x1={c.pts[i][0]} y1={c.pts[i][1]} x2={c.pts[j][0]} y2={c.pts[j][1]} color={STAR[c.color]} />
                : <line key={`l${i}-${j}`} x1={c.pts[i][0]} y1={c.pts[i][1]} x2={c.pts[j][0]} y2={c.pts[j][1]} stroke="var(--star)" strokeWidth={0.8} opacity={0.22} strokeDasharray="2 3" />;
            })}
            {c.pts.map(([x, y, r], i) => f[i] ? (
              <LitStar key={i} x={x} y={y} r={r * 1.15} color={STAR[f[i]]} />
            ) : <circle key={i} className="sky-slot" cx={x} cy={y} r={r + 0.8} />)}
            {/* both labels in the constellation's own star colour; a finished one's name glows (founder, Nov 17 2026) */}
            {done && (
              <g className="sky-name-glow" filter={`url(#${fid}nameglow)`} aria-hidden="true" style={{ fill: STAR[c.color] }}>
                <text className="sky-clabel-glow" x={lx} y={ly} textAnchor={anchor}>{c.name} · {have}/{c.pts.length}</text>
                <text className="sky-creal-glow" x={lx} y={ly + 14} textAnchor={anchor}>{c.real}</text>
              </g>
            )}
            <text className="sky-clabel" x={lx} y={ly} textAnchor={anchor} style={{ fill: STAR[c.color] }}>{c.name} · {have}/{c.pts.length}</text>
            <text className="sky-creal" x={lx} y={ly + 14} textAnchor={anchor} style={{ fill: STAR[c.color] }}>{c.real}</text>
          </g>
        );
      })}
      <RarestInSky state={state} />
      {/* the picks waiting sit at the bottom of the sky, just above the core's heat line (founder, Nov 17 2026) */}
      {picks > 0 && (
        <g className="sky-label">
          {Array.from({ length: picks }, (_, i) => <circle key={`p${i}`} className="sky-pending" cx={(i - (picks - 1) / 2) * 22} cy={230 - lift} r="5" />)}
          <text className="sky-creal" x="0" y={252 - lift} textAnchor="middle">{picks} pick{picks === 1 ? "" : "s"} waiting</text>
        </g>
      )}
      <Core mass={state.mass} collapsed={pending > 0} skin={equipped(state).core} />
    </svg>
  );
});

function Thumb({ find, hidden }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    drawObject(ctx, 112, find);
    if (hidden) { ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = "#1A1915"; ctx.fillRect(0, 0, 112, 112); ctx.globalCompositeOperation = "source-over"; }
  }, [find, hidden]);
  return <canvas ref={ref} width={112} height={112} aria-hidden="true" />;
}

// A catalogue card's detail (founder, Nov 17 2026: "make these clickable"). A kind: its 24 variants, colour by version, the ones found
// drawn with when and how often, the rest as dark outlines. A set: what it needs, what is already in, and what its power-up does.
const POWER_TEXT = Object.fromEntries(Object.values(POWERUPS).map((p) => [p.name, p.text]));
const SET_NEEDS = {
  trio: "any 3 of its 6 colors", spectrum: "all 6 colors", legend: "all 4 versions: plain, prismatic, ancient and mythic",
  quartet: "4 different kinds from this group", survey: "every kind in this group",
};
const versionName = (v) => VERSIONS.find((x) => x.id === v)?.name || "Plain";
// One found object as a card (founder, Nov 17 2026: "when I click on the thing it should show me a card with its information").
function FindCardView({ entry, onBack, onShare }) {
  const f = findOf(entry.fam, entry.colour, entry.version), fam = FAMILIES[entry.fam], pu = POWERUPS[entry.version];
  const ref = useRef(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (ctx) drawObject(ctx, 320, f); }, [f]);
  const first = new Date(entry.at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="sky-findcard">
      <div className="sky-lens"><canvas ref={ref} width={320} height={320} aria-hidden="true" /></div>
      <div className="sky-find">{f.name}</div>
      <div className="sky-rarity mono">1 in {f.oneIn.toLocaleString()} finds</div>
      <p className="sky-lore">{loreFor(entry.fam, entry.colour, entry.version)}</p>
      <dl className="sky-findcard-facts mono">
        <div><dt>Group</dt><dd>{TIER_NAME[fam.tier]}</dd></div>
        <div><dt>Color</dt><dd>{COLOURS.find((c) => c.id === entry.colour)?.name}</dd></div>
        <div><dt>Version</dt><dd>{versionName(entry.version)}</dd></div>
        <div><dt>{entry.n > 1 ? `First found · ${entry.n}x` : "Found"}</dt><dd>{first}</dd></div>
      </dl>
      {pu && <div className="sky-note is-blue"><span className="mono">Power-up</span><b>{pu.name}</b> {pu.text[0].toUpperCase() + pu.text.slice(1)}</div>}
      <div className="sky-row">
        <button type="button" className="btn-primary" onClick={() => onShare(f)}>Share this find</button>
        <button type="button" className="btn-ghost" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function CatDetail({ detail, entries, onClose, onShare }) {
  const box = useRef(null);
  const [card, setCard] = useState(null); // the found entry opened as a card
  useEffect(() => {
    box.current?.querySelector("button")?.focus();
    const k = (e) => { if (e.key !== "Escape") return; if (card) setCard(null); else onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, card]);
  // a found variant opens its card; one not found yet stays a plain tile
  const Tile = ({ e, find, label }) => e
    ? <button type="button" className="sky-variant is-found" onClick={() => setCard(e)} aria-label={`Open ${find.name}`}><Thumb find={find} /><span className="mono">{label}</span></button>
    : <div className="sky-variant is-unknown"><Thumb find={find} hidden /><span className="mono">{label}</span></div>;
  const set = detail.set, famId = detail.fam ?? set?.fam;
  const fam = famId != null ? FAMILIES[famId] : null;
  const mine = fam ? entries.filter((e) => e.fam === fam.id) : [];
  const title = set ? set.label : fam.name;
  return (
    <div className="sky-ov" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sky-ov-box sky-detail" ref={box}>
        <div className="sky-detail-head">
          <div className="board-panel-title">{title}</div>
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {card ? <FindCardView entry={card} onBack={() => setCard(null)} onShare={onShare} /> : <>
        {set && (
          <p className="sky-small mono">
            Needs {SET_NEEDS[set.kind]}. You have {set.have} of {set.of}. Finishing it gives <b>{set.power}</b>: {POWER_TEXT[set.power]}
          </p>
        )}
        {fam && (!set || set.kind !== "legend") && !(set && (set.kind === "quartet" || set.kind === "survey")) && (
          <>
            {!set && <p className="sky-small mono">{TIER_NAME[fam.tier]} · {mine.length} of {COLOURS.length * VERSIONS.length} found</p>}
            <div className="sky-variants" style={{ "--cols": VERSIONS.length }}>
              <span />{VERSIONS.map((v) => <span key={v.id} className="sky-variants-h mono">{versionName(v.id)}</span>)}
              {COLOURS.map((col) => [
                <span key={`c${col.id}`} className="sky-variants-h mono" style={{ color: col.c[0] }}>{col.name}</span>,
                ...VERSIONS.map((v) => {
                  const e = mine.find((x) => x.colour === col.id && x.version === v.id);
                  return (
                    <Tile key={`${col.id}${v.id}`} e={e} find={findOf(fam.id, col.id, v.id)} label={e ? `${e.n > 1 ? `${e.n}x · ` : ""}${new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Not found"} />
                  );
                }),
              ])}
            </div>
          </>
        )}
        {set?.kind === "legend" && (
          <div className="sky-variants" style={{ "--cols": VERSIONS.length }}>
            {VERSIONS.map((v) => {
              const e = mine.find((x) => x.version === v.id);
              return (
                <Tile key={v.id} e={e} find={findOf(fam.id, e?.colour || "silver", v.id)} label={`${versionName(v.id)}${e ? "" : " · not yet"}`} />
              );
            })}
          </div>
        )}
        {(set?.kind === "quartet" || set?.kind === "survey") && (
          <div className="sky-variants" style={{ "--cols": 4 }}>
            {famsIn(set.tier).map((k) => {
              const e = entries.filter((x) => x.fam === k.id).sort((a, b) => b.oneIn - a.oneIn)[0];
              return (
                <Tile key={k.id} e={e} find={e ? findOf(k.id, e.colour, e.version) : findOf(k.id, "silver", "")} label={e ? k.name : "???"} />
              );
            })}
          </div>
        )}
        </>}
      </div>
    </div>
  );
}

// The free "fill a gap" pick (ladder rungs with `pick`): every kind and colour of that tier the member hasn't found, the ones that would
// complete a set marked. The version is rolled on the server and the find goes to the telescope.
function PickDialog({ state, choice, busy, onClose, onPick }) {
  const opts = pickOptions(state, choice.tier);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const byFam = pickTiers(choice.tier).flatMap((t) => famsIn(t)).map((fam) => ({ fam, opts: opts.filter((o) => o.fam === fam.id) })).filter((g) => g.opts.length);
  return (
    <div className="sky-ov" role="dialog" aria-modal="true" aria-label={`Your pick: ${pickLabel(choice.tier)}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sky-ov-box sky-pick">
        <div className="board-panel-title">Your pick · {pickLabel(choice.tier)}</div>
        <p className="sky-small mono">Choose the kind and color. Only ones you haven&apos;t found are offered; the version (plain, prismatic, ancient or mythic) is rolled when it arrives.</p>
        <div className="sky-pick-list">
          {byFam.map(({ fam, opts: list }, i) => [
            pickTiers(choice.tier).length > 1 && byFam[i - 1]?.fam.tier !== fam.tier ? <div key={`t${fam.tier}`} className="sky-cat-h mono">{TIER_NAME[fam.tier]}</div> : null,
            <div key={fam.id} className="sky-pick-row">
              <Thumb find={findOf(fam.id, list[0].colour, "")} />
              <div>
                <b>{fam.name}</b>
                <div className="sky-pick-cols">
                  {list.map((o) => { const col = COLOURS.find((c) => c.id === o.colour); return (
                    <button key={o.colour} type="button" className={`sky-pick-col mono${o.completes.length ? " is-set" : ""}`} disabled={busy} onClick={() => onPick(o.fam, o.colour)}>
                      <i style={{ background: col.c[0] }} />{col.name}{o.completes.length ? <em>completes {o.completes.join(" + ")}</em> : null}
                    </button>
                  ); })}
                </div>
              </div>
            </div>,
          ])}
        </div>
        <div className="sky-row"><button type="button" className="btn-ghost" onClick={onClose}>Later</button></div>
      </div>
    </div>
  );
}

function Telescope({ queue, compliments, onDone, onShare, colourFirst }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const lens = useRef(null);
  const f = queue[i];
  // A different compliment per find, the same one each time that find is shown.
  const compliment = useMemo(() => {
    if (!compliments.length || !f) return null;
    let h = 0; for (const ch of f.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return compliments[h % compliments.length];
  }, [compliments, f]);
  useEffect(() => {
    if (!f || !lens.current) return;
    setShown(false);
    sharpen(lens.current, f, f.miss || null, () => setShown(true));
  }, [f]);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onDone]);
  if (!f) return null;
  const pu = POWERUPS[f.version];
  return (
    <div className="sky-ov" role="dialog" aria-modal="true" aria-label="The telescope">
      <div className="sky-ov-box">
        <div className="board-panel-title">The telescope {queue.length > 1 ? `· ${i + 1} of ${queue.length}` : ""}</div>
        <div className="sky-lens"><canvas ref={lens} width={320} height={320} /></div>
        {shown ? (
          <>
            <div className="sky-find">{f.name}</div>
            <div className="sky-rarity mono">1 in {f.oneIn.toLocaleString()} finds · {f.id}{f.first ? " · new to your catalog" : ""}</div>
            {f.fam != null && <p className="sky-lore">{loreFor(f.fam, f.colour, f.version)}</p>}
            <div className="sky-find-sub mono">{f.gift ? "Your pick from the ladder" : `+${f.pts} orbit points${f.first ? " (incl. +15 for a first discovery)" : ""}`}{f.shower ? " · meteor shower: every action places two stars for 10 minutes" : ""}</div>
            {compliment && <div className="sky-note is-gold"><span className="mono">Seen from up here</span><b>{compliment.head}.</b> {compliment.body}</div>}
            {pu && <div className="sky-note is-blue"><span className="mono">Power-up</span><b>{pu.name}</b> {pu.text[0].toUpperCase() + pu.text.slice(1)}</div>}
            {f.sets?.map((d) => <div key={d.label} className="sky-note is-blue"><span className="mono">Set complete · +{d.pts} orbit points</span><b>{d.label}</b>{d.power ? `Power-up: ${POWERUPS[d.power].name}, ${POWERUPS[d.power].text}` : ""}</div>)}
            {f.miss && <p className="sky-miss mono">A {f.miss === 3 ? "planet" : "comet"} was right at the edge of the frame. Finish {f.miss === 3 ? "The Playbook" : "a small constellation"} to bring it into view.</p>}
            <div className="sky-row">
              <button type="button" className="btn-primary" onClick={() => onShare(f, compliment)}>Share this find</button>
              {i < queue.length - 1 ? <button type="button" className="btn-ghost" onClick={() => setI(i + 1)}>Next find</button> : <button type="button" className="btn-ghost" onClick={onDone}>Back to the sky</button>}
            </div>
          </>
        ) : (
          <>
            {colourFirst && (() => { const col = COLOURS.find((c) => c.id === f.colour); return col ? <p className="sky-find-sub mono sky-colour-read"><i style={{ background: col.c[0] }} />Colour reading: {col.name}</p> : null; })()}
            <p className="sky-find-sub mono">Resolving …</p>
          </>
        )}
      </div>
    </div>
  );
}

// One full sentence per free pick, kept short enough for one line.
const PICK_NOUN = { 1: "asteroid", 2: "comet or dwarf world", 3: "planet or moon", 4: "meteor shower", 5: "stellar event" };
// A waiting reward, presented the way games present a claim (founder, Nov 22 2026: the plain banner "looks too basic"): the prize
// as a sealed silhouette (anticipation; it resolves when they choose), what they earned it for beside it (the rung and its season
// title) and one filled button; no animation (founder, Nov 22 2026). The bigger
// prizes (meteor showers, the any-tier pick, stellar events) get the gold frame, like a game's "valuable" frame.
const PICK_HEAD = { 1: "Asteroid of your choice", 2: "Comet or dwarf world of your choice", 3: "Planet or moon of your choice", 4: "Meteor shower of your choice", 5: "Stellar event of your choice" }; // no "free" (founder, Nov 22 2026)
const rewardRung = (key) => LADDER[Number(String(key).split(":")[1])] || null;
function RewardCard({ choice, busy, catOpen, findsLeft, onChoose, children }) {
  const pick = choice.type === "pick", any = Array.isArray(choice.tier);
  const tier = pick ? (any ? Math.max(...choice.tier) : choice.tier) : 0;
  const preview = useMemo(() => (pick ? findOf(famsIn(tier)[0].id, "silver", "") : null), [pick, tier]);
  const r = rewardRung(choice.key); // a reward from an older ladder may not match today's rung: then say nothing about where it came from
  const rung = r && (pick ? JSON.stringify(r.pick) === JSON.stringify(choice.tier) : r.skinChoice) ? r : null;
  const why = rung ? [rung.at ? `${rung.at.toLocaleString()} season points` : rungLabel(rung), rung.title && `Title: ${rung.title}`].filter(Boolean).join(" · ") : null;
  const big = !pick || any || tier >= 4;
  return (
    <article className={`sky-reward${big ? " is-big" : ""}${pick ? "" : " is-skin"}`}>
      <div className="sky-reward-prize" aria-hidden="true">
        {pick ? <Thumb find={preview} /> : <span className="sky-reward-skinmark">✦</span>}
        <span className="sky-reward-q">?</span>
      </div>
      <div className="sky-reward-body">
        <span className="sky-reward-eyebrow mono">Reward unlocked</span>
        <b className="sky-reward-head">{pick ? (any ? "Any find of your choice" : PICK_HEAD[tier]) : "A skin of your choice"}</b>
        <span className="sky-reward-what">
          {pick
            ? `${any ? "Pick anything you haven't found yet, from every tier but stellar events." : `Pick any ${PICK_NOUN[tier]} you haven't found yet.`} It goes straight to your telescope.`
            : "Pick the next sky or core skin below. It's yours for good."}
        </span>
        {why && <span className="sky-reward-why mono">Earned at {why}</span>}
      </div>
      {pick && (
        <div className="sky-reward-cta">
          {catOpen
            ? <button type="button" className="sky-reward-btn" disabled={busy} onClick={onChoose}>Choose yours <span aria-hidden="true">→</span></button>
            : <span className="mono sky-small">Opens with your catalog ({findsLeft} more finds)</span>}
        </div>
      )}
      {children && <div className="sky-reward-skins">{children}</div>}
    </article>
  );
}

export default function SkyClient({ initial, weekKey, event, compliments, now: serverNow, today }) {
  const [state, setState] = useState(initial);
  // Fresh from the server (founder, Nov 17 2026: a task done elsewhere didn't show as "Done today"): a page's star is written just after
  // that page is sent, and coming back (the back button, another tab) can show a copy from before it. So the sky reloads its data when
  // it opens, once more a moment later (to catch a star still being written), and whenever the tab comes back into view; each
  // reload's state replaces the one on screen.
  const router = useRouter();
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) { setSeenInitial(initial); setState(initial); } // a reload's state replaces the one on screen
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    refresh();
    const later = setTimeout(refresh, 2500);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { clearTimeout(later); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", refresh); };
  }, [router]);
  const [scope, setScope] = useState(false);
  const [detail, setDetail] = useState(null); // a catalogue card opened: { fam } or { set }
  const closeDetail = useCallback(() => setDetail(null), []);
  const [share, setShare] = useState(null); // { make, title, caption }
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(null); // a free pick being made: { key, tier }
  const [msg, setMsg] = useState(null);
  // the boost timers show whole minutes, so the clock ticks every 15 seconds (it ticked every second, re-rendering the page each time)
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const sp = seasonProgress(state), sky = skyFor(state.season), title = sp.title;
  const badge = state.season ? `${state.season} · ${sp.title.toUpperCase()}` : null;
  const past = Object.entries(state.skies || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  const wk = weekKey ? state.picks[weekKey] : null;
  const lastGraded = Object.entries(state.picks).filter(([, w]) => w.graded && w.made).sort((a, b) => (b[1].season - a[1].season) || (b[1].week - a[1].week))[0]?.[1] || null;
  const pendingPicks = wk && !wk.graded ? wk.choice.filter((c) => c != null) : [];
  const entries = Object.values(state.found);
  const b = state.boosts;

  const run = async (p) => {
    setBusy(true); setMsg(null);
    const r = await p.catch(() => ({ error: "Couldn't save that. Please try again." }));
    setBusy(false);
    if (r?.error) setMsg(r.error); else if (r?.state) setState(r.state);
  };
  const closeScope = useCallback(() => {
    setScope(false);
    run(seeFinds(state.pending.map((p) => p.id)));
  }, [state.pending]);

  const prepare = useCallback(async ({ onPreview }) => {
    setCardBadge(badge);
    setCardSkin(equipped(state)); // the member's skins go out on their cards
    setCardFrame(seasonProgress(state).frame);
    const blob = await toBlob(await share.make());
    const url = URL.createObjectURL(blob);
    onPreview(url);
    const form = new FormData();
    form.append("image", blob, "night-sky.png");
    form.append("title", share.title);
    form.append("caption", share.caption);
    form.append("view", "/account/sky");
    const res = await fetch("/api/lab-share", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || "Couldn't create the share link.");
    return { url: body.url, getFile: async () => new File([blob], "night-sky.png", { type: "image/png" }) };
  }, [share, badge, state]);

  const shareFind = (f, compliment) => setShare({
    title: `${title} discovered: ${f.name}`,
    caption: `I found a ${f.name}: 1 in ${f.oneIn.toLocaleString()} finds.${compliment ? ` ${compliment.head}.` : ""}`,
    make: () => findCard(f, { title, compliment: compliment?.head, have: entries.length, size: CATALOGUE_SIZE }),
  });

  const rarest = [...entries].sort((a, b) => b.oneIn - a.oneIn)[0] || null;
  const nextAt = LADDER.find((r) => r.at && sp.points < r.at), prevAt = [...LADDER].reverse().find((r) => r.at && sp.points >= r.at)?.at || 0;
  const frac = nextAt ? (sp.points - prevAt) / (nextAt.at - prevAt) : 1;
  const C = 2 * Math.PI * 48;
  const nextIdx = sp.done.indexOf(false);
  const catOpen = state.findsTotal >= UNLOCK.catalogue;
  const close = catOpen ? setProgress(state) : [];
  const done = new Set(state.daily?.day === today ? state.daily.done : []);

  return (
    <div className="sky">
      <div className="sky-top">
        <h1>Your sky</h1>
        <button type="button" className="btn-ghost" onClick={() => setShare({ title: `My season sky: ${title}`, caption: `My Night Sky this season: ${title}, ${sp.points.toLocaleString()} season points, ${entries.length} of ${CATALOGUE_SIZE.toLocaleString()} in my catalog.`, make: () => seasonCard(state, { title, size: CATALOGUE_SIZE, rarest }) })}>Share my season sky</button>
      </div>
      {(state.choices || []).length > 0 && (
        <section className="sky-rewards" aria-labelledby="sky-gifts">
          <h2 className="sr-only" id="sky-gifts">{state.choices.length > 1 ? "Rewards unlocked" : "Reward unlocked"}</h2>
          {state.choices.map((c) => (
            <RewardCard key={c.key} choice={c} busy={busy} catOpen={catOpen} findsLeft={UNLOCK.catalogue - state.findsTotal}
              onChoose={() => setChoosing(c)}>
              {c.type === "skin" && (
                <span className="sky-gift-skins">
                  {skinChoiceOptions(state).map((o) => (
                    <button key={o.id} type="button" className={`sky-skin rar-${o.rarity}`} disabled={busy} onClick={() => run(pickSkin(c.key, o.kind, o.id))}>
                      <span className="sky-skin-art"><SkinPreview kind={o.kind} id={o.id} /><span className="sky-skin-rarity mono">{RARITY[o.rarity]}</span></span>
                      <b>{o.name}</b><span className="sky-skin-how mono">{o.kind === "sky" ? "Sky" : "Core"} · Choose</span>
                    </button>
                  ))}
                </span>
              )}
            </RewardCard>
          ))}
        </section>
      )}

      {event && <div className="sky-forecast-box"><p className="sky-banner sky-forecast mono"><b>SPECIAL FORECAST:</b> {EVENT_TEXT[event]}</p></div>}
      {msg && <p className="sky-banner mono is-bad">{msg}</p>}

      <section className="sky-panel sky-panel-fill" aria-label="Your sky">
        <Sky state={state} picks={pendingPicks.length} pending={state.pending.length} />
        {state.pending.length > 0 && (
          <button type="button" className="btn-primary sky-scope-btn" onClick={() => setScope(true)}>
            The core collapsed{state.pending.length > 1 ? ` ${state.pending.length} times` : ""} · point the telescope
          </button>
        )}
      </section>

      <div className="sky-grid">
        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-earn">
            <div className="board-panel-title" id="sky-earn">Earn stars today</div>
            <ul className="sky-acts">
              {Object.entries(ACTIONS).map(([k, a]) => (
                <li key={k} className={done.has(k) ? "is-done" : ""}>
                  <Link href={a.href}><i style={{ background: STAR[a.color] }} />{a.label}</Link>
                  <span className="mono">{done.has(k) ? "Done today" : a.tool}</span>
                </li>
              ))}
            </ul>
            <div className="sky-boosts">
              {b.extra > 0 && <span className="mono">Refraction · +2 stars on the next {b.extra} action{b.extra === 1 ? "" : "s"}</span>}
              {b.tripleUntil > now ? <span className="mono">Gravity well · triple stars · {Math.ceil((b.tripleUntil - now) / 60000)} min</span> : b.doubleUntil > now ? <span className="mono">Old light · double stars · {Math.ceil((b.doubleUntil - now) / 60000)} min</span> : null}
              {b.goldUntil > now && <span className="mono">Old light · gold stars x3</span>}
              {state.shower > now && <span className="mono">Meteor shower · double stars · {Math.ceil((state.shower - now) / 60000)} min</span>}
              {b.noCoolUntil > now && <span className="mono">Gravity well · your core can&apos;t cool this week</span>}
            </div>
            <p className="sky-small mono">Each counts once a day. Leave the core alone for three days and it cools.</p>
          </section>

        </div>

        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-btm">
            <div className="board-panel-title" id="sky-btm">Beat the Model</div>
            {/* the picks, the rule and the result share the panel's whole height (founder, Nov 17 2026: it ended in empty space) */}
            <div className="sky-btm-body">
            {wk ? wk.pairs.map((p, i) => (
              <div key={i} className="sky-pick">
                {[p.a, p.b].map((name, k) => (
                  <button key={k} type="button" disabled={busy || wk.graded} className={wk.choice[i] === k ? "is-on" : ""} onClick={() => run(pickPlayer(weekKey, i, k))}>{name}</button>
                ))}
                <span className="sky-small mono">{p.pos} · the model says {p.model === 0 ? p.a : p.b} by {p.gap}</span>
              </div>
            )) : <p className="sky-small mono">This week&apos;s picks open when the new rankings are out.</p>}
            <p className="sky-small mono">Who scores more? Each pick places an unlit star; when the week&apos;s results are in, the right ones light up and earn 20 orbit points.</p>
            {lastGraded && (
              <div className="sky-row sky-row-stack">
                <span className="mono sky-small">Week {lastGraded.week}: {lastGraded.right} of {lastGraded.made} right · season {state.btm[0]}-{state.btm[1]}</span>
                <button type="button" className="btn-ghost" onClick={() => setShare({ title: `Beat the Model: ${lastGraded.right} of ${lastGraded.made}`, caption: `I went ${lastGraded.right} of ${lastGraded.made} against the model in week ${lastGraded.week}. Your turn.`, make: () => receiptCard(lastGraded) })}>Share my receipt</button>
              </div>
            )}
            </div>
          </section>
        </div>
      </div>

      <div className="sky-grid">
        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-odds">
          <div className="board-panel-title" id="sky-odds">What&apos;s out there</div>
          <ul className="sky-odds mono">
            <li>Asteroids (10 kinds), the most common</li>
            <li>Comets and dwarf worlds (8) · need a finished small constellation</li>
            <li>Planets and moons (12) · need a finished large constellation</li>
            <li>Meteor showers (4) · plus 10 minutes of double stars</li>
            <li>Stellar events (10), the rarest</li>
            <li>Colours, common to rare: silver, azure, amber, emerald, crimson, violet</li>
            <li>Versions, rarest last: prismatic, ancient, mythic</li>
          </ul>
          <p className="sky-small mono">If a find lands on something your constellations haven&apos;t powered, you get the biggest find they have, and you&apos;ll see the bigger one at the edge of the frame. Finish The Singularity and your next find is a stellar event.</p>
        </section>

          <section className="sky-panel" aria-labelledby="sky-log">
            <div className="board-panel-title" id="sky-log">Log</div>
            <ul className="sky-log mono">
              {state.log.length ? state.log.map((l, i) => <li key={i}>{l.text}</li>) : <li>Nothing yet. Open a tool from the list above to place your first star.</li>}
            </ul>
          </section>
        </div>
        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-season">
            <div className="board-panel-title" id="sky-season">Your season{state.season ? ` · ${state.season}` : ""}</div>
            <div className="sky-orbit">
              <svg viewBox="-60 -60 120 120" width="96" height="96" aria-hidden="true">
                <circle r="48" fill="none" stroke="var(--line)" strokeWidth="6" />
                <circle r="48" fill="none" stroke="var(--ember)" strokeWidth="6" transform="rotate(-90)" strokeDasharray={`${(C * frac).toFixed(1)} ${C}`} />
                <circle r="18" fill="var(--star)" />
              </svg>
              <div>
                <div className="sky-rank">{sp.title}</div>
                <div className="mono sky-small">{sp.points.toLocaleString()} orbit points this season · {sp.rungs} of {LADDER.length} rungs</div>
              </div>
            </div>
            <ul className="sky-season-sky">
              {sky.map((c) => <li key={c.id} className={(state.seasonDone?.[c.id] || 0) > 0 ? "is-done" : ""}><i style={{ background: STAR[c.color] }} />{c.real}</li>)}
            </ul>
            <ul className="sky-ladder is-season">
              {LADDER.map((r, i) => {
                const key = `${state.season}:${i}`, claimed = state.claimed?.[key];
                return (
                  <li key={i} className={sp.done[i] ? "is-got" : nextIdx === i ? "is-next" : ""}>
                    <span className="mono">{r.three ? `${sp.three}/3` : r.singularity ? (sp.singularity ? "1/1" : "0/1") : rungLabel(r)}</span>
                    <span>{r.singularity ? `Finish The Singularity (${sky[3].real}) this season: the ${state.season || ""} ${sky[3].real} sky skin, only available this season, and a season role in the Discord` : r.reward}</span>
                    {sp.done[i] && r.claim ? (claimed ? <span className="mono sky-small">{claimed.doneAt ? "Sent" : claimed.gave || "Claimed"}</span> : <button type="button" className="sky-claim mono" disabled={busy} onClick={() => run(claim(i))}>Claim</button>) : <span className="mono sky-small">{sp.done[i] ? "Earned" : ""}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="sky-small mono">The whole ladder starts over every September, with a new set of constellations. Your catalog, sets, skins and past seasons stay. Plan time is added the moment you claim it; the Discord role and newsletter shout-out are sent by hand within a few days. Perks last until the next season.</p>
          </section>

          <section className="sky-panel" aria-labelledby="sky-past">
            <div className="board-panel-title" id="sky-past">Past seasons</div>
            {past.length ? (
              <ul className="sky-past">
                {past.map(([y, k]) => (
                  <li key={y}>
                    <b className="mono">{y}</b>
                    <span>{k.title || "Spotter"}{k.charted ? " · Charted" : ""}{k.skin ? ` · ${skyFor(Number(y))[3].real} sky skin` : ""}</span>
                    <span className="mono sky-small">{(k.points || 0).toLocaleString()} pts</span>
                  </li>
                ))}
              </ul>
            ) : <p className="sky-small mono">Your first season is underway. Each finished season is kept here as a record.</p>}
            <p className="sky-small mono">{state.points.toLocaleString()} orbit points in total across every season.</p>
          </section>
        </div>
      </div>

          <section className="sky-panel" aria-labelledby="sky-cat">
          <div className="board-panel-title" id="sky-cat">The catalog</div>
          {!catOpen ? (
            <p className="sky-small mono">The catalog and its sets open after {UNLOCK.catalogue} finds ({UNLOCK.catalogue - state.findsTotal} to go).</p>
          ) : (
            <>
              <p className="sky-small mono">{entries.length.toLocaleString()} of {CATALOGUE_SIZE.toLocaleString()} discovered · {new Set(entries.map((e) => e.fam)).size} of {FAMILIES.length} kinds · sets {Object.keys(state.sets).length} of {SET_COUNT}</p>
              <div className="sky-sets">
                {close.map((c) => (
                  <button type="button" key={c.label} className={`sky-set${c.of - c.have === 1 ? " is-near" : ""}`} onClick={() => setDetail({ set: c })}>
                    <span>{c.label}</span><span className="mono">{c.have}/{c.of} → {c.power}</span><i style={{ width: `${(100 * c.have) / c.of}%` }} />
                  </button>
                ))}
              </div>
              <div className="sky-cat">
                {[1, 2, 3, 4, 5].map((t) => [
                  <div key={`h${t}`} className="sky-cat-h mono">{TIER_NAME[t]}</div>,
                  ...famsIn(t).map((fam) => {
                    const mine = entries.filter((e) => e.fam === fam.id);
                    const best = [...mine].sort((a, c) => c.oneIn - a.oneIn)[0];
                    return (
                      <button type="button" key={fam.id} className={`sky-obj${best ? "" : " is-unknown"}${best?.version ? " is-rare" : ""}`} onClick={() => setDetail({ fam: fam.id })} aria-label={best ? `${fam.name}: ${mine.length} found` : "An undiscovered kind"}>
                        <Thumb find={best ? findOf(best.fam, best.colour, best.version) : findOf(fam.id, "silver", "")} hidden={!best} />
                        <b>{best ? fam.name : "???"}</b>
                        <span className="sky-pips">{COLOURS.map((col) => <i key={col.id} style={{ background: mine.some((e) => e.colour === col.id) ? col.c[0] : "transparent", borderColor: col.c[0] }} />)}</span>
                        <span className="mono">{mine.length} of {COLOURS.length * VERSIONS.length}</span>
                      </button>
                    );
                  }),
                ])}
              </div>
            </>
          )}
        </section>


      

      

      <section className="sky-panel" aria-labelledby="sky-skins">
        <div className="board-panel-title" id="sky-skins">Skins</div>
        {["sky", "core"].map((kind) => (
          <div key={kind} className="sky-skins-row">
            <div className="sky-skins-h mono">{kind === "sky" ? "Sky" : "Core"}</div>
            <div className="sky-skins">
              {(kind === "sky" ? skySkinsFor(state) : coreSkinsFor(state)).map((k) => {
                const have = hasSkin(state, kind, k.id), on = equipped(state)[kind] === k.id;
                const [got, need] = !have && k.progress ? k.progress(state) : [0, 0];
                return (
                  <button key={k.id} type="button" className={`sky-skin rar-${k.rarity}${on ? " is-on" : ""}${have ? "" : " is-locked"}`} disabled={!have || on || busy} onClick={() => run(wearSkin(kind, k.id))} aria-pressed={on}>
                    <span className="sky-skin-art">
                      <SkinPreview kind={kind} id={k.id} />
                      <span className="sky-skin-rarity mono">{RARITY[k.rarity]}</span>
                      {!have && <span className="sky-skin-lock" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg></span>}
                    </span>
                    <b>{k.name}</b>
                    <span className="sky-skin-how mono">{on ? "Applied" : have ? "Apply" : k.how}</span>
                    {!have && need > 0 && (
                      <span className="sky-skin-bar" aria-label={`${Math.min(got, need).toLocaleString()} of ${need.toLocaleString()}`}>
                        <i style={{ width: `${Math.min(100, (100 * got) / need)}%` }} />
                        <em className="mono">{need > 1 ? `${Math.min(got, need).toLocaleString()} / ${need.toLocaleString()}` : "Not yet"}</em>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {scope && <Telescope queue={state.pending} compliments={compliments} onDone={closeScope} onShare={shareFind} colourFirst={hasTelescope(state)} />}
      {choosing && <PickDialog state={state} choice={choosing} busy={busy} onClose={() => setChoosing(null)} onPick={(fam, colour) => run(freePick(choosing.key, fam, colour)).then(() => setChoosing(null))} />}
      {detail && <CatDetail detail={detail} entries={entries} onClose={closeDetail} onShare={(f) => shareFind(f, null)} />}
      {share && <ShareDialog prepare={prepare} caption={share.caption} onClose={() => setShare(null)} />}
    </div>
  );
}

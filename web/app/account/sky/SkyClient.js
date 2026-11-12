"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ShareDialog from "../../ShareDialog";
import { seeFinds, pickPlayer, claim, wearSkin } from "./actions";
import { SkyBackdrop, CoreSkin, SkinPreview } from "./skins";
import { StarField, Galaxies, Spikes } from "./hubble";
import { drawObject, sharpen, findCard, receiptCard, seasonCard, toBlob, setCardBadge, setCardSkin, setCardFrame } from "./skyArt";
import {
  ACTIONS, skyFor, SKINS, RARITY, hasSkin, equipped, skySkinsFor, FAMILIES, COLOURS, VERSIONS, TIER_NAME, POWERUPS, LADDER, rungLabel, CATALOGUE_SIZE, SET_COUNT, UNLOCK, EVENT_TEXT,
  famsIn, findOf, setProgress, seasonProgress,
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
      <defs>
        <radialGradient id={`${gid}c`} cx=".42" cy=".4"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" /><stop offset=".45" stopColor="#FFFFFF" stopOpacity=".25" /><stop offset=".85" stopColor="#000000" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity=".22" /></radialGradient>
      </defs>
      <circle className="sky-core-glow" r="70" />
      {ticks.map((t, i) => <line key={i} className={`sky-core-tick${t.lit ? ` is-lit is-${t.band}` : ""}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
      <circle className="sky-core-debris" r="62" />
      <CoreSkin skin={skin} layer="back" />
      <circle className="sky-core-rim" r="54" />
      <circle className="sky-core-body" r="44" />
      {/* a luminous star, Hubble-style: a bright centre falling off to the edge, a soft halo and four diffraction spikes (dark theme only) */}
      <circle className="sky-core-shine" r="44" fill={`url(#${gid}c)`} />
      <g className="sky-core-spikes"><Spikes x={0} y={0} len={92} color="var(--sky-t-white)" width={1.2} opacity={0.45} /></g>
      <CoreSkin skin={skin} layer="front" />
      {collapsed && <circle className="sky-core-lens" r="49" />}
      <text className="sky-heat" x="0" y="106" textAnchor="middle">
        {collapsed ? "Collapsed · a find is waiting" : STAGES.map((x, i) => (
          <tspan key={x.id} className={x.id === st.id ? "is-on" : ""}>{i ? "  ·  " : ""}{x.label}</tspan>
        ))}
      </text>
    </g>
  );
}

function Sky({ state, pendingPicks, pending }) {
  const fid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const open = state.findsTotal >= UNLOCK.constellations;
  return (
    <svg className="sky-svg" viewBox="-300 -300 600 600" role="img" aria-label={`Your sky: ${state.findsTotal} finds, the core ${pending ? "collapsed" : stageOf(state.mass).label.toLowerCase()}`}>
      <SkyBackdrop skin={equipped(state).sky} />
      <Galaxies id={fid} seed={31} n={12} />
      <StarField seed={7} n={170} spikes={6} />
      {skyFor(state.season).map((c) => {
        const f = state.filled[c.id] || [];
        if (!open) return <g key={c.id}>{c.pts.map(([x, y], i) => f[i] ? <circle key={i} cx={x} cy={y} r={3} fill="var(--star)" /> : null)}</g>;
        const have = f.filter(Boolean).length, done = have === c.pts.length, near = !done && have === c.pts.length - 1;
        const [lx, ly, anchor] = c.label;
        return (
          <g key={c.id}>
            {c.edges.map(([i, j]) => {
              const lit = f[i] && f[j];
              return <line key={`l${i}-${j}`} x1={c.pts[i][0]} y1={c.pts[i][1]} x2={c.pts[j][0]} y2={c.pts[j][1]} stroke={lit ? STAR[c.color] : "var(--star)"} strokeWidth={lit ? 1.3 : 0.8} opacity={lit ? 0.7 : 0.14} strokeDasharray={lit ? undefined : "2 3"} />;
            })}
            {c.pts.map(([x, y, r], i) => f[i] ? (
              <g key={i}><circle cx={x} cy={y} r={r * 2.4} fill={STAR[f[i]]} fillOpacity=".14" /><circle cx={x} cy={y} r={r} fill={STAR[f[i]]} /></g>
            ) : <circle key={i} className="sky-slot" cx={x} cy={y} r={r + 0.8} />)}
<text className={`sky-clabel${done ? " is-done" : near ? " is-near" : ""}`} x={lx} y={ly} textAnchor={anchor}>{c.name} · {have}/{c.pts.length}</text>
            <text className={`sky-creal${done ? " is-done" : near ? " is-near" : ""}`} x={lx} y={ly + 14} textAnchor={anchor}>{c.real}{done ? " · ready" : near ? " · one star away" : ""}</text>
          </g>
        );
      })}
      {pendingPicks.length > 0 && (
        <g>
          {pendingPicks.map((_, i) => <circle key={`p${i}`} className="sky-pending" cx={(i - (pendingPicks.length - 1) / 2) * 22} cy={138} r="5" />)}
          <text className="sky-creal" x="0" y="160" textAnchor="middle">{pendingPicks.length} pick{pendingPicks.length === 1 ? "" : "s"} waiting</text>
        </g>
      )}
      <Core mass={state.mass} collapsed={pending > 0} skin={equipped(state).core} />
    </svg>
  );
}

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

function Telescope({ queue, compliments, onDone, onShare }) {
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
            <div className="sky-rarity mono">1 in {f.oneIn.toLocaleString()} finds · {f.id}{f.first ? " · new to your catalogue" : ""}</div>
            <div className="sky-find-sub mono">+{f.pts} orbit points{f.first ? " (incl. +15 for a first discovery)" : ""}{f.shower ? " · meteor shower: every action places two stars for 10 minutes" : ""}</div>
            {compliment && <div className="sky-note is-gold"><span className="mono">Seen from up here</span><b>{compliment.head}.</b> {compliment.body}</div>}
            {pu && <div className="sky-note is-blue"><span className="mono">Power-up</span><b>{pu.name}</b> {pu.text[0].toUpperCase() + pu.text.slice(1)}</div>}
            {f.sets?.map((d) => <div key={d.label} className="sky-note is-blue"><span className="mono">Set complete · +{d.pts} orbit points</span><b>{d.label}</b>{d.power ? `Power-up: ${POWERUPS[d.power].name}, ${POWERUPS[d.power].text}` : ""}</div>)}
            {f.miss && <p className="sky-miss mono">A {f.miss === 3 ? "planet" : "comet"} was right at the edge of the frame. Finish {f.miss === 3 ? "The Playbook" : "a small constellation"} to bring it into view.</p>}
            <div className="sky-row">
              <button type="button" className="btn-primary" onClick={() => onShare(f, compliment)}>Share this find</button>
              {i < queue.length - 1 ? <button type="button" className="btn-ghost" onClick={() => setI(i + 1)}>Next find</button> : <button type="button" className="btn-ghost" onClick={onDone}>Back to the sky</button>}
            </div>
          </>
        ) : <p className="sky-find-sub mono">Resolving …</p>}
      </div>
    </div>
  );
}

export default function SkyClient({ initial, weekKey, event, compliments, now: serverNow, today }) {
  const [state, setState] = useState(initial);
  const [scope, setScope] = useState(false);
  const [share, setShare] = useState(null); // { make, title, caption }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [now, setNow] = useState(serverNow); // ticks once a second so the boost timers count down
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const sp = seasonProgress(state), sky = skyFor(state.season), title = sp.title;
  const badge = state.season ? `${state.season} · ${sp.title.toUpperCase()}` : null;
  const past = Object.entries(state.skies || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  const wk = weekKey ? state.picks[weekKey] : null;
  const lastGraded = Object.entries(state.picks).filter(([, w]) => w.graded && w.made).sort((a, b) => (b[1].season - a[1].season) || (b[1].week - a[1].week))[0]?.[1] || null;
  const pendingPicks = wk && !wk.graded ? wk.choice.filter((c) => c != null) : [];
  const entries = Object.values(state.found);
  const rarest = [...entries].sort((a, b) => b.oneIn - a.oneIn)[0] || null;
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

  const nextAt = LADDER.find((r) => r.at && sp.points < r.at), prevAt = [...LADDER].reverse().find((r) => r.at && sp.points >= r.at)?.at || 0;
  const frac = nextAt ? (sp.points - prevAt) / (nextAt.at - prevAt) : 1;
  const C = 2 * Math.PI * 48;
  const nextIdx = sp.done.indexOf(false);
  const catOpen = state.findsTotal >= UNLOCK.catalogue;
  const close = catOpen ? setProgress(state) : [];
  const done = new Set(state.daily?.day === today ? state.daily.done : []);

  return (
    <div className="sky">
      {event && <p className="sky-banner mono">{EVENT_TEXT[event]}</p>}
      {msg && <p className="sky-banner mono is-bad">{msg}</p>}

      <div className="sky-grid">
        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-h">
            <div className="board-panel-title" id="sky-h">The sky</div>
            <Sky state={state} pendingPicks={pendingPicks} pending={state.pending.length} />
            {state.pending.length > 0 ? (
              <button type="button" className="btn-primary sky-scope-btn" onClick={() => setScope(true)}>
                The core collapsed{state.pending.length > 1 ? ` ${state.pending.length} times` : ""} · point the telescope
              </button>
            ) : (
              <p className="sky-note-line mono">{state.strains ? `The core strained ${state.strains} time${state.strains === 1 ? "" : "s"} since your last look … and held.` : "Earn stars below. The core collapses at a moment nobody knows."}</p>
            )}
            <div className="sky-row">
              <button type="button" className="btn-ghost" onClick={() => setShare({ title: `My season sky: ${title}`, caption: `My Night Sky this season: ${title}, ${sp.points.toLocaleString()} season points, ${entries.length} of ${CATALOGUE_SIZE.toLocaleString()} in my catalogue.`, make: () => seasonCard(state, { title, size: CATALOGUE_SIZE, rarest }) })}>Share my season sky</button>
            </div>
          </section>

          
        </div>

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

          <section className="sky-panel" aria-labelledby="sky-btm">
            <div className="board-panel-title" id="sky-btm">Beat the Model</div>
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
              <div className="sky-row">
                <span className="mono sky-small">Week {lastGraded.week}: {lastGraded.right} of {lastGraded.made} right · season {state.btm[0]}-{state.btm[1]}</span>
                <button type="button" className="btn-ghost" onClick={() => setShare({ title: `Beat the Model: ${lastGraded.right} of ${lastGraded.made}`, caption: `I went ${lastGraded.right} of ${lastGraded.made} against the model in week ${lastGraded.week}. Your turn.`, make: () => receiptCard(lastGraded) })}>Share my receipt</button>
              </div>
            )}
          </section>

          

          
        </div>
      </div>

      <div className="sky-grid">
        <div className="sky-col">
          <section className="sky-panel" aria-labelledby="sky-log">
        <div className="board-panel-title" id="sky-log">Log</div>
        <ul className="sky-log mono">
          {state.log.length ? state.log.map((l, i) => <li key={i}>{l.text}</li>) : <li>Nothing yet. Open a tool from the list above to place your first star.</li>}
        </ul>
      </section>

          <section className="sky-panel" aria-labelledby="sky-odds">
          <div className="board-panel-title" id="sky-odds">What&apos;s out there</div>
          <ul className="sky-odds mono">
            <li>Small bodies (10 kinds), the most common</li>
            <li>Comets and dwarf worlds (8) · need a finished small constellation</li>
            <li>Planets and moons (12) · need a finished large constellation</li>
            <li>Meteor showers (4) · plus 10 minutes of double stars</li>
            <li>Stellar events (10), the rarest</li>
            <li>Colours, common to rare: silver, azure, amber, emerald, crimson, violet</li>
            <li>Versions, rarest last: prismatic, ancient, mythic</li>
          </ul>
          <p className="sky-small mono">If a find lands on something your constellations haven&apos;t powered, you get the biggest find they have, and you&apos;ll see the bigger one at the edge of the frame. Finish The Singularity and your next find is a stellar event.</p>
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
                    <span>{r.singularity ? `Finish The Singularity (${sky[3].real}) this season: the ${state.season || ""} ${sky[3].real} sky skin, only available this season` : r.reward}</span>
                    {sp.done[i] && r.claim ? (claimed ? <span className="mono sky-small">Claimed</span> : <button type="button" className="sky-claim mono" disabled={busy} onClick={() => run(claim(i))}>Claim</button>) : <span className="mono sky-small">{sp.done[i] ? "Earned" : ""}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="sky-small mono">The whole ladder starts over every September, with a new set of constellations. Your catalogue, sets, skins and past seasons stay. Claimed rewards are sent to you by hand within a few days, and perks last until the next season.</p>
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
          <div className="board-panel-title" id="sky-cat">The catalogue</div>
          {!catOpen ? (
            <p className="sky-small mono">The catalogue and its sets open after {UNLOCK.catalogue} finds ({UNLOCK.catalogue - state.findsTotal} to go).</p>
          ) : (
            <>
              <p className="sky-small mono">{entries.length.toLocaleString()} of {CATALOGUE_SIZE.toLocaleString()} discovered · {new Set(entries.map((e) => e.fam)).size} of {FAMILIES.length} kinds · sets {Object.keys(state.sets).length} of {SET_COUNT}</p>
              <div className="sky-sets">
                {close.map((c) => (
                  <div key={c.label} className={`sky-set${c.of - c.have === 1 ? " is-near" : ""}`}>
                    <span>{c.label}</span><span className="mono">{c.have}/{c.of} → {c.power}</span><i style={{ width: `${(100 * c.have) / c.of}%` }} />
                  </div>
                ))}
              </div>
              <div className="sky-cat">
                {[1, 2, 3, 4, 5].map((t) => [
                  <div key={`h${t}`} className="sky-cat-h mono">{TIER_NAME[t]}</div>,
                  ...famsIn(t).map((fam) => {
                    const mine = entries.filter((e) => e.fam === fam.id);
                    const best = [...mine].sort((a, c) => c.oneIn - a.oneIn)[0];
                    return (
                      <div key={fam.id} className={`sky-obj${best ? "" : " is-unknown"}${best?.version ? " is-rare" : ""}`}>
                        <Thumb find={best ? findOf(best.fam, best.colour, best.version) : findOf(fam.id, "silver", "")} hidden={!best} />
                        <b>{best ? fam.name : "???"}</b>
                        <span className="sky-pips">{COLOURS.map((col) => <i key={col.id} style={{ background: mine.some((e) => e.colour === col.id) ? col.c[0] : "transparent", borderColor: col.c[0] }} />)}</span>
                        <span className="mono">{mine.length} of {COLOURS.length * VERSIONS.length}</span>
                      </div>
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
              {(kind === "sky" ? skySkinsFor(state) : SKINS.core).map((k) => {
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
                    <span className="sky-skin-how mono">{on ? "Wearing" : have ? "Wear it" : k.how}</span>
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

      {scope && <Telescope queue={state.pending} compliments={compliments} onDone={closeScope} onShare={shareFind} />}
      {share && <ShareDialog prepare={prepare} caption={share.caption} onClose={() => setShare(null)} />}
    </div>
  );
}

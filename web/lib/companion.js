// The Game Board's companion pane (app/my-team/Companion.js): short, plain-English cards that always have something to say about
// the viewer's leagues -- before kickoff (widest-range players, closest matchups, lineup holes, best on the waiver wire, matchup trends and form), during games
// (the same swing watch, on live numbers), after them (best and worst performers, who decided each matchup) and all week
// (playoff picture, exposure across leagues). Pure, no imports; tested in test/companion.test.mjs. It is rules over the numbers
// the board already holds (lineups with projection / floor / ceiling / points, standings, the waiver list, each player's matchup trend and badges) -- not a
// language model, and nothing here is stored.
//
// savedTeams: saved_teams rows (settings.h2h.mine / .opp = { id, slot, name, pos, team, proj, floor, ceiling, pts, out }).
// gameStates: lib/gameStatus.js (team -> { state: "pre" | "in" | "post" }).
// waivers: { [teamId]: [{ name, pos, team, proj }] } best available per league, optional.

import { lineupAdvice, slotLabel } from "./lineupOptimizer.js";
import { num, leagueName, fmt1 } from "./format.js";

const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const sgn = (v) => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`;
const leagueOf = (t) => leagueName(t, "your league");
const chip = (p) => (p ? { name: p.name, pos: p.pos, team: p.team } : null);

const stateOf = (p, gameStates) => {
  if (!p?.id || !p.team) return "none";
  return gameStates?.[p.team]?.state || "none";
};

// What a lineup spot is worth right now: his points once he's done, at least his points / projection while he plays, the
// projection before kickoff, nothing if he's out or empty.
function worth(p, st) {
  if (!p?.id || p.out) return num(p?.pts) ?? 0;
  const pts = num(p.pts) ?? 0;
  const proj = num(p.proj) ?? 0;
  if (st === "post") return pts;
  if (st === "in") return Math.max(pts, proj);
  if (st === "none") return pts;
  return proj;
}

// `adjusted` (optional): { [teamId]: matchupState() result } from the Game Board, so the lineups and the live totals here
// are the very same numbers the league cards show (the plays Sleeper hasn't posted yet included); without it, the saved snapshot.
function leagues(savedTeams, gameStates, adjusted = null) {
  const out = [];
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.bestBall || s.isBye || !s.h2h?.mine?.length || !s.h2h?.opp?.length) continue;
    const adj = adjusted?.[t.id]?.adj || null;
    const h2h = adj ? adj.lists : s.h2h;
    const mine = h2h.mine.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const opp = h2h.opp.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const total = (rows) => rows.reduce((a, p) => a + worth(p, p.st), 0);
    const all = [...mine, ...opp];
    const done = all.every((p) => p.st === "post" || p.st === "none" || !p.id);
    const anyPlayed = all.some((p) => p.st === "post" || p.st === "in");
    out.push({
      t,
      id: t.id,
      name: leagueOf(t),
      opponent: s.opponent || "your opponent",
      h2h,
      mine,
      opp,
      margin: total(mine) - total(opp), // projected (played games at their points)
      live: (adj ? adj.live : s.matchupActual) || null,
      done: done && anyPlayed,
      anyPlayed,
    });
  }
  return out;
}


// Lineup upgrades: the biggest swap per league from the optimizer (lib/lineupOptimizer.js: median + Smash / Tough Spot). Only while someone in the
// lineup can still move.
function lineupCards(savedTeams, gameStates, adjusted, injuriesByTeam) {
  const cards = [];
  for (const t of savedTeams || []) {
    // The board already worked the advice out for its alert counts (row.alertCount.advice); only compute it when running without the board.
    const a = adjusted?.[t.id]?.row ? adjusted[t.id].row.alertCount.advice : lineupAdvice(t, gameStates, injuriesByTeam?.[t.id]);
    if (!a || !a.swaps.length || a.gain < 1) continue;
    const top = a.swaps[0];
    cards.push({
      id: `lineup:${t.id}`,
      kind: "lineup",
      label: "Lineup upgrade",
      tone: "mine",
      title: `Start ${top.in.name}${top.out ? ` over ${top.out.name}` : ""} in ${leagueOf(t)}`,
      body: `At ${slotLabel(top.slot)}: ${fmt1(top.in.myProjPts)} against ${top.out ? fmt1(top.out.myProjPts) : "an empty slot"}${top.why ? ` (${top.why})` : ""}, ${r1(top.gain)} more.${a.swaps.length > 1 ? ` ${a.swaps.length - 1} more ${a.swaps.length === 2 ? "swap" : "swaps"} on the Lineup Alerts tab, ${r1(a.gain)} in all.` : ""}`,
      player: chip({ name: top.in.name, pos: top.in.position, team: top.in.team }),
      league: leagueOf(t),
      priority: 92 + Math.min(5, Math.round(a.gain / 3)),
    });
  }
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

// ---- before and during games ------------------------------------------------------------------------------------------------

// ---- the week, in points (published projections, not win probabilities: a win-chance model has not been backtested, so no card uses one) ----

const gapText = (v) => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`;

// The week across your leagues by projected points (lineups at their projections; games already played at their points).
function outlook(ls) {
  const open = ls.filter((l) => !l.done);
  if (open.length < 2) return null;
  const ahead = open.filter((l) => l.margin >= 0).length;
  const closest = [...open].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];
  const widest = [...open].sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin))[0];
  return {
    id: "outlook",
    kind: "outlook",
    label: "The week so far",
    tone: ahead * 2 >= open.length ? "mine" : "theirs",
    title: `Ahead on projections in ${ahead} of ${open.length} matchups`,
    body: `Closest: ${closest.name} (${gapText(closest.margin)}). Widest: ${widest.name} (${gapText(widest.margin)}). Gaps are projected points: your lineup's medians against theirs, games already played at their points.`,
    priority: 70,
  };
}

// The widest-range player still to play in your closest matchups (by projected gap), either side. His floor-to-ceiling range against the gap
// says whether his game alone can decide it -- in points, with no probability attached.
function swings(ls) {
  const open = ls
    .filter((l) => !l.done)
    .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))
    .slice(0, 3);
  const cards = [];
  for (const l of open) {
    let top = null;
    for (const [side, rows] of [["mine", l.mine], ["opp", l.opp]])
      for (const p of rows) {
        if (!p.id || p.out || (p.st !== "pre" && p.st !== "in") || num(p.ceiling) == null || num(p.floor) == null || num(p.proj) == null) continue;
        const spread = p.ceiling - p.floor;
        if (!top || spread > top.spread) top = { p, side, spread };
      }
    if (!top) continue;
    const { p } = top;
    const mineSide = top.side === "mine";
    const gap = Math.abs(l.margin);
    const up = p.ceiling - p.proj;
    const down = p.proj - p.floor;
    const decides = Math.min(up, down) > gap ? "Either end of his range is bigger than the gap, so his game alone can decide this matchup." : Math.max(up, down) > gap ? "One end of his range is bigger than the gap." : "The gap is bigger than either end of his range.";
    cards.push({
      id: `swing:${l.id}`,
      kind: "swing",
      label: "Swing player",
      tone: mineSide ? "mine" : "theirs",
      title: `${p.name} has the widest range in ${l.name}`,
      body: `${mineSide ? "Yours" : `${l.opponent}'s`}, still to play: projected ${r1(p.proj)}, floor ${r1(p.floor)}, ceiling ${r1(p.ceiling)} (${gapText(-down)} / ${gapText(up)} from his projection). The projected gap in this matchup is ${r1(gap)} ${l.margin >= 0 ? "in your favor" : "against you"}. ${decides}`,
      player: chip(p),
      league: l.name,
      priority: 90 - Math.min(30, Math.round(gap)),
    });
  }
  return cards;
}

// Where you trail on projections: the opponent's best player still to play.
function threats(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done || l.margin >= 0) continue;
    const best = l.opp
      .filter((p) => p.id && !p.out && p.st === "pre" && num(p.proj) != null)
      .sort((a, b) => b.proj - a.proj)[0];
    if (!best) continue;
    cards.push({
      id: `threat:${l.id}`,
      kind: "threat",
      label: "Their best card",
      tone: "theirs",
      title: `${best.name} is ${l.opponent}'s biggest threat`,
      body:
        `Projected ${r1(best.proj)} in ${l.name}, where you trail by ${r1(-l.margin)} on projections.` +
        (num(best.ceiling) != null && num(best.floor) != null ? ` His range is ${r1(best.floor)} to ${r1(best.ceiling)}: a game at his floor is ${r1(best.proj - best.floor)} under projection, your way back.` : ""),
      player: chip(best),
      league: l.name,
      priority: 66,
    });
    if (cards.length >= 2) break;
  }
  return cards;
}

function holes(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done) continue;
    for (const p of l.mine) {
      const empty = !p.id;
      const out = p.id && p.out && p.st !== "post";
      if (!empty && !out) continue;
      const slot = p.slot === "SUPER_FLEX" ? "SUPERFLEX" : p.slot || "a";
      cards.push({
        id: `hole:${l.id}:${p.slot}:${p.id || "empty"}`,
        kind: "alert",
        label: "Fix before kickoff",
        tone: "alert",
        title: empty ? `Empty ${slot} slot in ${l.name}` : `${p.name} isn't active in ${l.name}`,
        body: empty ? "Nobody is starting there, so it scores zero." : `He's in your ${slot} slot and counts as zero. Swap him out.`,
        player: out ? chip(p) : null,
        league: l.name,
        priority: 100,
      });
    }
  }
  return cards.slice(0, 3);
}

// A player in several of your lineups: what his projection and range add up to across them, and where it matters most (the closest matchup).
// And a player who is on your side in some leagues and against you in others: the net, in points.
function exposure(ls) {
  const mine = new Map();
  const against = new Map();
  for (const l of ls) {
    for (const p of l.mine) if (p.id) mine.set(p.id, [...(mine.get(p.id) || []), { l, p }]);
    for (const p of l.opp) if (p.id) against.set(p.id, [...(against.get(p.id) || []), { l, p }]);
  }
  const live = (p) => p.st === "pre" || p.st === "in";
  const cards = [];
  const multi = [...mine.values()]
    .filter((v) => v.length >= 2 && v.some(({ p }) => live(p)) && num(v[0].p.proj) != null)
    .sort((a, b) => b.length - a.length || (b[0].p.proj || 0) - (a[0].p.proj || 0))[0];
  if (multi) {
    const p = multi[0].p;
    const n = multi.length;
    const closest = [...multi].sort((a, b) => Math.abs(a.l.margin) - Math.abs(b.l.margin))[0];
    const range = num(p.floor) != null && num(p.ceiling) != null ? ` His range is ${r1(p.floor)} to ${r1(p.ceiling)}, so across the ${n} leagues the same game is ${r1(n * p.floor)} to ${r1(n * p.ceiling)} points.` : "";
    cards.push({
      id: `exposure:${p.id}`,
      kind: "exposure",
      label: "Big exposure",
      tone: "mine",
      title: `${p.name} starts in ${n} of your leagues`,
      body: `Projected ${r1(p.proj)} in each.${range} The closest of those matchups is ${closest.l.name} (projected gap ${gapText(closest.l.margin)}).`,
      player: chip(p),
      priority: 62,
    });
  }
  for (const [id, own] of mine) {
    const foes = against.get(id);
    if (!foes) continue;
    const p = own[0].p;
    if (p.st === "post" || num(p.proj) == null) continue;
    const net = own.length - foes.length;
    cards.push({
      id: `hedge:${id}`,
      kind: "exposure",
      label: "Both sides",
      tone: "neutral",
      title: `${p.name} is on both sides of your week`,
      body:
        `You start him in ${own.map((o) => o.l.name).join(", ")}; he plays against you in ${foes.map((o) => o.l.name).join(", ")}. Projected ${r1(p.proj)}` +
        (num(p.ceiling) != null ? `, ceiling ${r1(p.ceiling)}` : "") +
        `. ${net === 0 ? "A big game helps you as often as it hurts: it nets out." : net > 0 ? `You're on his side in ${net} more matchup${net === 1 ? "" : "s"} than you're against him.` : `You face him in ${-net} more matchup${net === -1 ? "" : "s"} than you start him.`}`,
      player: chip(p),
      priority: 64,
    });
    break;
  }
  return cards;
}

// ---- cards built from the rest of the site's data (matchup trends, form badges, range badges, position-by-position gaps) ----

const hasBadge = (p, key) => (p.achievements || []).some((a) => a.key === key);
const startersToPlay = (t, gameStates) =>
  (t.players || []).filter((p) => p.isStarter && !(p.team && gameStates?.[p.team] && gameStates[p.team].state !== "pre"));

// Smash Spots and Tough Spots among your starters this week (Weekly Projection Rankings' matchup trends, saved with each player as myLean):
// the points are what that defense gives up to his position a game compared with an average defense.
function matchupTrends(savedTeams, gameStates) {
  const byId = new Map();
  for (const t of savedTeams || []) {
    if (t.settings?.bestBall || t.settings?.isBye) continue;
    for (const p of startersToPlay(t, gameStates)) {
      const e = num(p.myLean?.effect);
      if (e == null) continue;
      const cur = byId.get(p.player_id) || { p, leagues: 0 };
      cur.leagues++;
      byId.set(p.player_id, cur);
    }
  }
  const all = [...byId.values()];
  const smash = all.filter((x) => x.p.myLean.effect > 0).sort((a, b) => b.p.myLean.effect - a.p.myLean.effect);
  const tough = all.filter((x) => x.p.myLean.effect < 0).sort((a, b) => a.p.myLean.effect - b.p.myLean.effect);
  if (!smash.length && !tough.length) return null;
  const list = (xs) => xs.map((x) => `${x.p.name} ${gapText(x.p.myLean.effect)}${x.leagues > 1 ? ` (${x.leagues} leagues)` : ""}`).join(", ");
  const lead = smash[0] || tough[0];
  return {
    id: "matchup-trends",
    kind: "trend",
    label: "Matchup trends",
    tone: smash.length >= tough.length ? "mine" : "theirs",
    title: `${smash.length} starter${smash.length === 1 ? "" : "s"} in a Smash Spot, ${tough.length} in a Tough Spot`,
    body: `${smash.length ? `Smash: ${list(smash)}. ` : ""}${tough.length ? `Tough: ${list(tough)}. ` : ""}The points are what that defense gives up to his position a game against an average defense.`,
    player: chip({ name: lead.p.name, pos: lead.p.position, team: lead.p.team }),
    priority: 80,
  };
}

// Form among your starters: On Fire / On Thin Ice (recent points against expected points) and Buy Low / Sell High (opportunity against production).
function formWatch(savedTeams, gameStates) {
  const seen = new Map();
  for (const t of savedTeams || []) {
    if (t.settings?.bestBall || t.settings?.isBye) continue;
    for (const p of t.players || []) {
      const flags = ["onFire", "onIce", "buyLow", "sellHigh"].filter((k) => hasBadge(p, k));
      if (!flags.length) continue;
      const cur = seen.get(p.player_id) || { p, flags, started: 0, leagues: 0, locked: false };
      cur.leagues++;
      if (p.isStarter) cur.started++;
      seen.set(p.player_id, cur);
    }
  }
  const all = [...seen.values()];
  const names = (key, onlyStarters) =>
    all.filter((x) => x.flags.includes(key) && (!onlyStarters || x.started > 0)).map((x) => `${x.p.name}${x.leagues > 1 ? ` (${x.leagues} leagues)` : ""}`);
  const fire = names("onFire", true);
  const ice = names("onIce", true);
  const cards = [];
  if (fire.length || ice.length) {
    const lead = all.find((x) => x.flags.includes(fire.length ? "onFire" : "onIce") && x.started > 0);
    cards.push({
      id: "form",
      kind: "trend",
      label: "Form check",
      tone: fire.length >= ice.length ? "mine" : "theirs",
      title: `${fire.length} of your starters on fire, ${ice.length} on thin ice`,
      body: `${fire.length ? `On Fire: ${fire.join(", ")}. ` : ""}${ice.length ? `On Thin Ice: ${ice.join(", ")}. ` : ""}The badges compare his recent games with what his usage said he should score.`,
      player: lead ? chip({ name: lead.p.name, pos: lead.p.position, team: lead.p.team }) : null,
      priority: 72,
    });
  }
  const buy = names("buyLow", false);
  const sell = names("sellHigh", false);
  if (buy.length || sell.length) {
    const lead = all.find((x) => x.flags.includes(buy.length ? "buyLow" : "sellHigh"));
    cards.push({
      id: "value",
      kind: "trend",
      label: "Value watch",
      tone: "neutral",
      title: `${buy.length} Buy Low, ${sell.length} Sell High on your rosters`,
      body: `${buy.length ? `Buy Low (heavy opportunity, light production): ${buy.join(", ")}. ` : ""}${sell.length ? `Sell High (production running ahead of opportunity): ${sell.join(", ")}.` : ""}`.trim(),
      player: lead ? chip({ name: lead.p.name, pos: lead.p.position, team: lead.p.team }) : null,
      priority: 52,
    });
  }
  return cards;
}

// Range profile of your lineups: how many starters carry a Steady Eddy (narrow range for his position) or Risky Icarus (wide range) badge.
function rangeProfile(savedTeams, gameStates) {
  const rows = [];
  for (const t of savedTeams || []) {
    if (t.settings?.bestBall || t.settings?.isBye) continue;
    const st = startersToPlay(t, gameStates);
    const steady = st.filter((p) => hasBadge(p, "locked"));
    const risky = st.filter((p) => hasBadge(p, "volatile"));
    if (steady.length + risky.length >= 2) rows.push({ t, steady, risky });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => Math.abs(b.risky.length - b.steady.length) - Math.abs(a.risky.length - a.steady.length));
  const top = rows[0];
  const lean = top.risky.length > top.steady.length ? "leans volatile" : top.steady.length > top.risky.length ? "leans steady" : "is balanced";
  const lead = (top.risky[0] || top.steady[0]);
  return {
    id: "range-profile",
    kind: "trend",
    label: "Range profile",
    tone: "neutral",
    title: `Your ${leagueOf(top.t)} lineup ${lean}`,
    body: `${top.steady.length} Steady Eddy${top.steady.length ? ` (${top.steady.map((p) => p.name).join(", ")})` : ""}, ${top.risky.length} Risky Icarus${top.risky.length ? ` (${top.risky.map((p) => p.name).join(", ")})` : ""} among the starters still to play. Steady Eddy marks a narrower floor-to-ceiling range than his position's norm; Risky Icarus a wider one.`,
    player: lead ? chip({ name: lead.name, pos: lead.position, team: lead.team }) : null,
    priority: 58,
  };
}

// Position by position in your closest matchups: projected points of each position group, yours against theirs (flex slots counted at the player's own position).
function positionGaps(ls) {
  const groups = ["QB", "RB", "WR", "TE"];
  const sum = (rows, pos) => rows.filter((p) => p.id && !p.out && p.pos === pos).reduce((a, p) => a + (num(p.proj) ?? 0), 0);
  const cards = [];
  for (const l of [...ls].filter((x) => !x.done).sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 2)) {
    const diffs = groups.map((g) => ({ g, d: sum(l.mine, g) - sum(l.opp, g) })).filter((x) => Math.abs(x.d) >= 0.5);
    if (diffs.length < 2) continue;
    const best = [...diffs].sort((a, b) => b.d - a.d)[0];
    const worst = [...diffs].sort((a, b) => a.d - b.d)[0];
    if (best.d <= 0 || worst.d >= 0) continue;
    cards.push({
      id: `gaps:${l.id}`,
      kind: "trend",
      label: "Position by position",
      tone: "neutral",
      title: `In ${l.name}: your edge is ${best.g}, your hole is ${worst.g}`,
      body: `Projected points of each position group, yours minus ${l.opponent}'s: ${diffs.map((x) => `${x.g} ${gapText(x.d)}`).join(", ")}. Overall ${gapText(l.margin)}.`,
      league: l.name,
      priority: 74,
    });
  }
  return cards;
}

function waiverCards(ls, waivers) {
  if (!waivers) return [];
  const cards = [];
  for (const l of ls) {
    const list = waivers[l.id];
    if (!list?.length) continue;
    let best = null;
    for (const w of list) {
      const starters = l.mine.filter((p) => p.id && p.pos === w.pos && num(p.proj) != null);
      if (!starters.length) continue;
      const weakest = starters.sort((a, b) => a.proj - b.proj)[0];
      const gain = w.proj - weakest.proj;
      if (gain >= 1.5 && (!best || gain > best.gain)) best = { w, weakest, gain };
    }
    if (!best) continue;
    cards.push({
      id: `waiver:${l.id}`,
      kind: "waiver",
      label: "Best on the wire",
      tone: "mine",
      title: `Add ${best.w.name} in ${l.name}`,
      body: `Projected ${r1(best.w.proj)}, ${r1(best.gain)} more than ${best.weakest.name} (${r1(best.weakest.proj)}), your lowest ${best.w.pos} starter.`,
      player: chip(best.w),
      league: l.name,
      priority: 58 + Math.min(10, Math.round(best.gain)),
    });
  }
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

// ---- after games ---------------------------------------------------------------------------------------------------------------

function recaps(ls) {
  const rows = [];
  for (const l of ls) {
    for (const [side, list] of [["mine", l.mine], ["opp", l.opp]]) {
      for (const p of list) {
        if (p.st !== "post" || !p.id || num(p.proj) == null || p.proj <= 0 || num(p.pts) == null) continue;
        rows.push({ l, side, p, delta: p.pts - p.proj });
      }
    }
  }
  const mineRows = rows.filter((r) => r.side === "mine");
  const cards = [];
  if (mineRows.length) {
    const star = [...mineRows].sort((a, b) => b.delta - a.delta)[0];
    if (star.delta >= 3)
      cards.push({
        id: "star",
        kind: "recap",
        label: "Star of your week",
        tone: "mine",
        title: `${star.p.name}: ${star.p.pts.toFixed(1)} points`,
        body: `${sgn(star.delta)} over his ${r1(star.p.proj)} projection in ${star.l.name}.`,
        player: chip(star.p),
        league: star.l.name,
        priority: 88,
      });
    const dud = [...mineRows].sort((a, b) => a.delta - b.delta)[0];
    if (dud.delta <= -3)
      cards.push({
        id: "dud",
        kind: "recap",
        label: "Biggest letdown",
        tone: "theirs",
        title: `${dud.p.name}: ${dud.p.pts.toFixed(1)} points`,
        body: `${r1(Math.abs(dud.delta))} under his ${r1(dud.p.proj)} projection in ${dud.l.name}.`,
        player: chip(dud.p),
        league: dud.l.name,
        priority: 86,
      });
  }
  // Who moved each matchup: replace one player's points with his projection and see whether the result flips.
  for (const l of ls) {
    if (!l.anyPlayed) continue;
    const margin = l.live ? l.live.mine - l.live.opp : null;
    if (margin == null || margin === 0) continue;
    const mine = rows.filter((r) => r.l === l);
    const flips = mine
      .filter((r) => {
        const without = r.side === "mine" ? margin - r.delta : margin + r.delta;
        return Math.sign(without) !== Math.sign(margin) && Math.abs(r.delta) >= 2;
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const state = l.done ? (margin > 0 ? "won" : "lost") : margin > 0 ? "leading" : "trailing";
    if (flips.length) {
      const f = flips[0];
      const who = f.side === "mine" ? f.p.name : `${l.opponent}'s ${f.p.name}`;
      const without = f.side === "mine" ? margin - f.delta : margin + f.delta;
      cards.push({
        id: `flip:${l.id}`,
        kind: "recap",
        label: l.done ? "Decided by one player" : "Moving the matchup",
        tone: margin > 0 ? "mine" : "theirs",
        title: `${who} ${l.done ? "decided" : "is deciding"} ${l.name}`,
        body: `${state === "won" ? "You won" : state === "lost" ? "You lost" : `You're ${state}`} by ${r1(Math.abs(margin))}. Had ${f.p.name} scored his projection (${r1(f.p.proj)}) instead of ${f.p.pts.toFixed(1)}, the result would be ${without > 0 ? "yours" : "theirs"} by ${r1(Math.abs(without))}.`,
        player: chip(f.p),
        league: l.name,
        priority: 92,
      });
    } else if (l.done) {
      const top = mine.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      cards.push({
        id: `final:${l.id}`,
        kind: "recap",
        label: "Final",
        tone: margin > 0 ? "mine" : "theirs",
        title: `${margin > 0 ? "Won" : "Lost"} ${l.name} by ${r1(Math.abs(margin))}`,
        body: top ? `Biggest swing: ${top.side === "mine" ? top.p.name : `${l.opponent}'s ${top.p.name}`}, ${sgn(top.delta)} against his projection. No single player flipped it.` : "No single player flipped it.",
        player: top ? chip(top.p) : null,
        league: l.name,
        priority: 80,
      });
    }
  }
  const finished = ls.filter((l) => l.done && l.live);
  if (finished.length >= 2) {
    const won = finished.filter((l) => l.live.mine > l.live.opp).length;
    cards.push({
      id: "weekrecap",
      kind: "recap",
      label: "Week in the books",
      tone: won * 2 >= finished.length ? "mine" : "theirs",
      title: `Won ${won} of ${finished.length} matchups`,
      body: `${won === finished.length ? "A clean sweep." : `${finished.length - won} lost.`} ${r1(finished.reduce((a, l) => a + l.live.mine, 0) / finished.length)} points a league on average.`,
      priority: 84,
    });
  }
  return cards;
}

// ---- all week --------------------------------------------------------------------------------------------------------------

function season(savedTeams) {
  const cards = [];
  const withOdds = (savedTeams || []).filter((t) => num(t.settings?.playoffOdds) != null && !t.settings?.playoffSettled && !t.settings?.bestBall);
  const bubble = [...withOdds].sort((a, b) => Math.abs(a.settings.playoffOdds - 0.5) - Math.abs(b.settings.playoffOdds - 0.5))[0];
  if (bubble) {
    const s = bubble.settings;
    cards.push({
      id: "bubble",
      kind: "season",
      label: "Playoff picture",
      tone: s.playoffOdds >= 0.5 ? "mine" : "theirs",
      title: `${leagueOf(bubble)} is your tightest race`,
      body: `${Math.round(s.playoffOdds * 100)}% to make the playoffs at ${s.record || "—"}${s.season?.weeksLeft != null ? `, ${s.season.weeksLeft} regular-season ${s.season.weeksLeft === 1 ? "week" : "weeks"} left` : ""}. Every win moves it.`,
      league: leagueOf(bubble),
      priority: 50,
    });
  }
  const safe = withOdds.filter((t) => t.settings.playoffOdds >= 0.9);
  if (withOdds.length >= 2)
    cards.push({
      id: "oddsmix",
      kind: "season",
      label: "Across your leagues",
      tone: "neutral",
      title: `Playoffs likely in ${withOdds.filter((t) => t.settings.playoffOdds >= 0.5).length} of ${withOdds.length} leagues`,
      body: `${safe.length} ${safe.length === 1 ? "is" : "are"} close to locked (90%+). Expected playoff berths: ${withOdds.reduce((a, t) => a + t.settings.playoffOdds, 0).toFixed(1)}.`,
      priority: 46,
    });
  return cards;
}

function tidbits(ls) {
  const mine = ls.flatMap((l) => l.mine.filter((p) => p.id && !p.out && num(p.proj) != null && p.st !== "post").map((p) => ({ p, l })));
  const cards = [];
  if (mine.length) {
    const top = [...mine].sort((a, b) => b.p.proj - a.p.proj)[0];
    cards.push({
      id: "topproj",
      kind: "tidbit",
      label: "Your top projection",
      tone: "mine",
      title: `${top.p.name}, ${r1(top.p.proj)}`,
      body: `The highest-projected starter still to play on any of your teams (${top.l.name}).`,
      player: chip(top.p),
      priority: 40,
    });
    const boom = [...mine].filter((x) => num(x.p.ceiling) != null).sort((a, b) => b.p.ceiling - a.p.ceiling)[0];
    if (boom && boom.p.id !== top.p.id)
      cards.push({
        id: "topceil",
        kind: "tidbit",
        label: "Highest ceiling",
        tone: "mine",
        title: `${boom.p.name} could reach ${r1(boom.p.ceiling)}`,
        body: `His 90th-percentile game, the highest on your lineups. About one week in ten he gets there or beyond.`,
        player: chip(boom.p),
        priority: 39,
      });
  }
  return cards;
}


// ---- all week: what changed, injuries, standings, and a card for today ------------------------------------------------------------

// "Since last week": the players on the viewer's teams whose projections, status or role moved between the two latest published
// weeks (lib/myFeed.js buildFeed, built on the server). Starters first; at most three cards so one busy week doesn't crowd the pane.
function changes(feed, teamIndex) {
  if (!feed?.ready) return [];
  const data = teamIndex == null ? feed.all : feed.byTeam?.[teamIndex];
  const cards = [];
  for (const it of (data?.items || []).slice(0, 3)) {
    const [main, ...rest] = it.lines;
    const where = it.teams?.length ? ` ${it.starter ? "Starting" : "On your bench"} in ${it.teams.map((t) => t.label).join(", ")}.` : "";
    cards.push({
      id: `change:${it.name}`,
      kind: "change",
      label: feed.prevWeek ? `Since week ${feed.prevWeek}` : "Since last week",
      tone: main.dir === "up" ? "mine" : main.dir === "down" ? "theirs" : "neutral",
      title: it.name,
      body: `${[main, ...rest.slice(0, 1)].map((l) => l.text).join(". ")}.${where}`,
      player: { name: it.name, pos: it.position, team: null },
      priority: 68 - cards.length,
    });
  }
  return cards;
}

const TAGS = { 1: "Questionable", 2: "Doubtful", 3: "Out" };
function injuryCard(ls, injuriesByTeam) {
  if (!injuriesByTeam) return null;
  const hurt = new Map();
  for (const l of ls) {
    for (const i of injuriesByTeam[l.id] || []) {
      const p = l.mine.find((x) => x.name === i.name);
      if (!p || p.st === "post" || p.st === "in") continue;
      const prev = hurt.get(i.name);
      if (!prev || i.severity > prev.severity) hurt.set(i.name, { name: i.name, status: i.status || TAGS[i.severity] || "Questionable", severity: i.severity, leagues: new Set() });
      hurt.get(i.name).leagues.add(l.name);
    }
  }
  if (!hurt.size) return null;
  const list = [...hurt.values()].sort((a, b) => b.severity - a.severity);
  const worst = list[0];
  return {
    id: "injuries",
    kind: "injury",
    label: "Injury report",
    tone: worst.severity >= 2 ? "alert" : "neutral",
    title: `${list.length} of your starters ${list.length === 1 ? "carries" : "carry"} an injury tag`,
    body: list.slice(0, 4).map((h) => `${h.name} (${h.status}${h.leagues.size > 1 ? `, ${h.leagues.size} leagues` : ""})`).join("; ") + (list.length > 4 ? `; and ${list.length - 4} more` : "") + ".",
    priority: worst.severity >= 2 ? 96 : 74,
  };
}

function standingsCard(savedTeams) {
  const rows = [];
  for (const t of savedTeams || []) {
    const me = t.settings?.season?.standings?.find((r) => r.isMe);
    const n = t.settings?.season?.standings?.length;
    if (me && n) rows.push({ t, me, n });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.me.rank / a.n - b.me.rank / b.n);
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const ord = (k) => `${k}${["th", "st", "nd", "rd"][k % 100 > 10 && k % 100 < 14 ? 0 : k % 10 < 4 ? k % 10 : 0]}`;
  const rec = (m) => `${m.wins}-${m.losses}${m.ties ? `-${m.ties}` : ""}`;
  return {
    id: "standings",
    kind: "season",
    label: "Standings",
    tone: best.me.rank / best.n <= 0.34 ? "mine" : "neutral",
    title: `Best spot: ${ord(best.me.rank)} of ${best.n} in ${leagueOf(best.t)}`,
    body: `${rec(best.me)}, ${Math.round(best.me.pf)} points scored.${rows.length > 1 ? ` Hardest: ${ord(worst.me.rank)} of ${worst.n} in ${leagueOf(worst.t)} (${rec(worst.me)}).` : ""}`,
    league: null,
    priority: 48,
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// One card for today, so the pane has something fitting every day of the week: on game days who of yours (and theirs) is in action and
// when; on the other days what that day is for (Tuesday new projections, Wednesday waivers, Friday / Saturday the injury report).
function dayCard({ now, ls, gameStates, feed, waivers, injuryCount }) {
  const day = DAYS[now.getDay()];
  const label = `Today · ${day}`;
  const todays = (rows) =>
    rows.filter((p) => {
      const g = p.id && p.team && gameStates?.[p.team];
      return g && g.start && (p.st === "pre" || p.st === "in") && sameDay(new Date(g.start), now);
    });
  const mine = new Map();
  const theirs = new Set();
  for (const l of ls) {
    for (const p of todays(l.mine)) mine.set(p.id, p);
    for (const p of todays(l.opp)) theirs.add(p.id);
  }
  if (mine.size + theirs.size > 0) {
    const starts = [...mine.values(), ...[].concat(...ls.map((l) => todays(l.opp)))].map((p) => new Date(gameStates[p.team].start).getTime());
    const first = new Date(Math.min(...starts));
    const windows = new Map();
    for (const p of mine.values()) {
      const k = clock(new Date(gameStates[p.team].start));
      windows.set(k, (windows.get(k) || 0) + 1);
    }
    const top = [...mine.values()].sort((a, b) => (b.proj || 0) - (a.proj || 0))[0];
    return {
      id: "today",
      kind: "today",
      label,
      tone: "mine",
      title: mine.size ? `${mine.size} of your starters ${mine.size === 1 ? "plays" : "play"} today` : `${theirs.size} of your opponents' starters play today`,
      body: `First kickoff ${clock(first)}.${windows.size > 1 ? ` By kickoff: ${[...windows].map(([k, n]) => `${k} (${n})`).join(", ")}.` : ""}${theirs.size ? ` ${theirs.size} of your opponents' starters ${theirs.size === 1 ? "is" : "are"} in action too.` : ""}${top ? ` Biggest name of yours: ${top.name}.` : ""}`,
      player: top ? chip(top) : null,
      priority: 94,
    };
  }
  const base = { id: "today", kind: "today", label, tone: "neutral", priority: 85 };
  if (day === "Tuesday")
    return { ...base, tone: "mine", title: "New week, new projections", body: feed?.ready ? `Week ${feed.week} projections publish today. ${feed.all?.starters ?? 0} of your starters have moved since week ${feed.prevWeek}; the changes are listed below.` : "The projections for the new week publish today. Your swing players and lineup checks fill in as they land." };
  if (day === "Wednesday") {
    let best = null;
    for (const l of ls) for (const w of waivers?.[l.id] || []) if (!best || w.proj > best.w.proj) best = { w, l };
    return { ...base, tone: "mine", title: "Waiver day", body: best ? `Best available across your leagues: ${best.w.name} (${best.w.pos}), projected ${r1(best.w.proj)} in ${best.l.name}. Waivers usually clear overnight, so claim before then.` : "Waivers usually clear overnight. The Best available tab in each league shows who is worth a claim.", player: best ? chip(best.w) : null };
  }
  if (day === "Thursday") return { ...base, title: "First game of the week is tonight", body: "Set your lineup before kickoff: Thursday's slot locks the moment its game starts." };
  if (day === "Friday" || day === "Saturday")
    return { ...base, tone: injuryCount ? "alert" : "neutral", title: injuryCount ? `${injuryCount} starter${injuryCount === 1 ? "" : "s"} to check before Sunday` : "No injury flags on your starters", body: injuryCount ? "The final injury designations come out by Saturday. Have a replacement picked for anyone listed Questionable or worse." : "Nothing to fix right now. Final designations come out by Saturday, so check once more tomorrow." };
  if (day === "Monday") return { ...base, title: "Week is wrapping up", body: "Whatever is still to play shows in the swing cards. Next week's projections land Tuesday." };
  return { ...base, title: "Sunday", body: "Kickoffs and your players in each window appear here as the schedule loads." };
}

// Overall state of the week across the viewer's lineups.
const phaseOf = (ls, gameStates) => {
  if (!gameStates) return "unknown";
  let pre = 0;
  let live = 0;
  let post = 0;
  for (const l of ls) {
    for (const p of [...l.mine, ...l.opp]) {
      if (p.st === "pre") pre++;
      else if (p.st === "in") live++;
      else if (p.st === "post") post++;
    }
  }
  if (live > 0) return "live";
  if (pre > 0 && post > 0) return "between";
  if (pre > 0) return "preview";
  if (post > 0) return "recap";
  return "off";
};
export const weekPhase = (savedTeams, gameStates) => phaseOf(leagues(savedTeams, gameStates), gameStates);

// All cards for the viewer's leagues, best first for the current phase.
export function buildInsights({ savedTeams, gameStates, waivers = null, injuriesByTeam = null, feed = null, teamIndex = null, now = null, adjusted = null }) {
  const ls = leagues(savedTeams, gameStates, adjusted);
  const phase = phaseOf(ls, gameStates);
  const cards = [];
  const add = (c) => (Array.isArray(c) ? cards.push(...c) : c && cards.push(c));
  add(holes(ls));
  add(lineupCards(savedTeams, gameStates, adjusted, injuriesByTeam));
  add(outlook(ls));
  add(swings(ls));
  add(threats(ls));
  add(exposure(ls));
  add(matchupTrends(savedTeams, gameStates));
  add(formWatch(savedTeams, gameStates));
  add(positionGaps(ls));
  add(rangeProfile(savedTeams, gameStates));
  add(waiverCards(ls, waivers));
  add(recaps(ls));
  add(season(savedTeams));
  add(tidbits(ls));
  add(changes(feed, teamIndex));
  const inj = injuryCard(ls, injuriesByTeam);
  add(inj);
  add(standingsCard(savedTeams));
  if (now) add(dayCard({ now, ls, gameStates, feed, waivers, injuryCount: inj ? Number(inj.title.split(" ")[0]) : 0 }));
  // Once the games are over, the recap leads; before them, the previews do.
  if (phase === "recap" || phase === "off") for (const c of cards) if (c.kind === "recap") c.priority += 15;
  if (phase === "preview") for (const c of cards) if (c.kind === "alert" || c.kind === "waiver") c.priority += 6;
  cards.sort((a, b) => b.priority - a.priority);
  return { phase, cards };
}

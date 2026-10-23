// The Game Board's companion pane (app/my-team/Companion.js): short, plain-English cards that always have something to say about
// the viewer's leagues -- before kickoff (swing players, closest matchups, lineup holes, best on the waiver wire), during games
// (the same swing watch, on live numbers), after them (best and worst performers, who decided each matchup) and all week
// (playoff picture, exposure across leagues). Pure, no imports; tested in test/companion.test.mjs. It is rules over the numbers
// the board already holds (lineups with projection / floor / ceiling / points, win chances, standings, the waiver list) -- not a
// language model, and nothing here is stored.
//
// savedTeams: saved_teams rows (settings.h2h.mine / .opp = { id, slot, name, pos, team, proj, floor, ceiling, pts, out }).
// gameStates: lib/gameStatus.js (team -> { state: "pre" | "in" | "post" }).
// waivers: { [teamId]: [{ name, pos, team, proj }] } best available per league, optional.

import { lineupAdvice, slotLabel } from "./lineupOptimizer.js";
import { playerLeverage } from "./winChance.js";
import { num, leagueName } from "./format.js";

const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const sgn = (v) => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`;
const leagueOf = (t) => leagueName(t, "your league");
const pc = (v) => `${Math.round(v * 100)}%`;
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

// `adjusted` (optional): { [teamId]: matchupState() result } from the Game Board, so the lineups, the live totals and the win chance here
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
      win: num(adj ? adj.winChance : s.winChance),
      live: (adj ? adj.live : s.matchupActual) || null,
      done: done && anyPlayed,
      anyPlayed,
    });
  }
  return out;
}


// Lineup upgrades: the biggest projection gain per league from the optimizer (lib/lineupOptimizer.js), and the ceiling / floor tilt
// when the win chance is lopsided. Only while someone in the lineup can still move.
function lineupCards(savedTeams, gameStates, adjusted) {
  const cards = [];
  for (const t of savedTeams || []) {
    // The board already worked the advice out for its alert counts (row.alertCount.advice); only compute it when running without the board.
    const a = adjusted?.[t.id]?.row ? adjusted[t.id].row.alertCount.advice : lineupAdvice(t, gameStates);
    if (!a || !a.swaps.length) continue;
    const top = a.swaps[0];
    if (a.gain >= 1) {
      cards.push({
        id: `lineup:${t.id}`,
        kind: "lineup",
        label: "Lineup upgrade",
        tone: "mine",
        title: `Start ${top.in.name}${top.out ? ` over ${top.out.name}` : ""} in ${leagueOf(t)}`,
        body: `At ${slotLabel(top.slot)}: ${r1(top.in.myProjPts)} against ${top.out ? r1(top.out.myProjPts) : "an empty slot"}, ${r1(top.gain)} more.${a.swaps.length > 1 ? ` ${a.swaps.length - 1} more ${a.swaps.length === 2 ? "swap" : "swaps"} on the Lineup tab, ${r1(a.gain)} in all.` : ""}`,
        player: chip({ name: top.in.name, pos: top.in.position, team: top.in.team }),
        league: leagueOf(t),
        priority: 92 + Math.min(5, Math.round(a.gain / 3)),
      });
    }
    if (a.tilt) {
      const x = a.tilt.swaps[0];
      cards.push({
        id: `tilt:${t.id}`,
        kind: "lineup",
        label: a.tilt.mode === "ceiling" ? "Swing for the ceiling" : "Protect the floor",
        tone: a.tilt.mode === "ceiling" ? "theirs" : "mine",
        title: `${a.tilt.mode === "ceiling" ? "Underdog" : "Favorite"} in ${leagueOf(t)}: start ${x.in.name}${x.out ? ` over ${x.out.name}` : ""}`,
        body: `At ${Math.round(a.tilt.win * 100)}% to win, this adds ${r1(a.tilt.gain)} to your ${a.tilt.mode} and moves your projection ${a.tilt.medianChange >= 0 ? "+" : "−"}${r1(Math.abs(a.tilt.medianChange))}.`,
        player: chip({ name: x.in.name, pos: x.in.position, team: x.in.team }),
        league: leagueOf(t),
        priority: 78,
      });
    }
  }
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

// ---- before and during games ------------------------------------------------------------------------------------------------

function outlook(ls) {
  const withWin = ls.filter((l) => l.win != null && !l.done);
  if (withWin.length < 2) return null;
  const fav = withWin.filter((l) => l.win >= 0.5).length;
  const expected = withWin.reduce((a, l) => a + l.win, 0);
  const closest = [...withWin].sort((a, b) => Math.abs(a.win - 0.5) - Math.abs(b.win - 0.5))[0];
  const safest = [...withWin].sort((a, b) => b.win - a.win)[0];
  return {
    id: "outlook",
    kind: "outlook",
    label: "The week so far",
    tone: fav * 2 >= withWin.length ? "mine" : "theirs",
    title: `Favored in ${fav} of ${withWin.length} matchups`,
    body: `That's about ${expected.toFixed(1)} wins expected. Closest: ${closest.name} (${Math.round(closest.win * 100)}%). Safest: ${safest.name} (${Math.round(safest.win * 100)}%).`,
    priority: 70,
  };
}

// Win-chance leverage (lib/winChance.js playerLeverage): the matchup simulated with one player's game pinned at his floor / median /
// ceiling, so a card can say what HIS game does to the win chance, not just how wide his range is.
// 1,500 draws a run (the default 5,000 would make a refresh of the pane take seconds): every run uses the same random numbers, so the
// differences between floor / median / ceiling are exact even though each percentage carries about a point of noise.
// The percentages are shifted so "now" is exactly the win chance the league card shows (l.win, from the full-size run); the shift
// moves all three outcomes together, so the gaps between them stay as the simulation found them.
const lev = (l, side, p, gameStates) => {
  const v = playerLeverage(l.h2h, gameStates, side, p.id, { draws: 1500 });
  if (!v || l.win == null) return v;
  const d = l.win - v.base;
  const c = (x) => Math.min(1, Math.max(0, x + d));
  const [atFloor, atMedian, atCeiling] = [c(v.atFloor), c(v.atMedian), c(v.atCeiling)];
  return { ...v, base: l.win, atFloor, atMedian, atCeiling, swing: Math.abs(atCeiling - atFloor), lo: Math.min(atFloor, atCeiling), hi: Math.max(atFloor, atCeiling) };
};
const ptsOfWin = (v) => `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}`;

function swings(ls, gameStates) {
  const open = ls
    .filter((l) => l.win != null && !l.done)
    .sort((a, b) => Math.abs(a.win - 0.5) - Math.abs(b.win - 0.5))
    .slice(0, 3);
  const cards = [];
  for (const l of open) {
    // The swing player is the one whose game moves THIS matchup's win chance the most -- not just the widest range.
    // Only the three widest-ranged players are simulated (the leverage run is the expensive part).
    const cand = [];
    for (const [side, rows] of [["mine", l.mine], ["opp", l.opp]])
      for (const p of rows) {
        if (!p.id || p.out || (p.st !== "pre" && p.st !== "in") || num(p.ceiling) == null || num(p.floor) == null) continue;
        cand.push({ p, side, spread: p.ceiling - p.floor });
      }
    let top = null;
    for (const c of cand.sort((a, b) => b.spread - a.spread).slice(0, 3)) {
      const v = lev(l, c.side, c.p, gameStates);
      if (v && (!top || v.swing > top.v.swing)) top = { p: c.p, side: c.side, v };
    }
    if (!top) continue;
    const { v } = top;
    const mineSide = top.side === "mine";
    const proj = num(top.p.proj);
    const gap = Math.abs(l.margin);
    const leading = l.margin >= 0;
    const need = !leading && v.hi < 0.5 ? "Even his best game leaves you the underdog." : !leading && v.lo >= 0.5 ? "Even his worst game keeps you ahead." : "";
    cards.push({
      id: `swing:${l.id}`,
      kind: "swing",
      label: "Swing player",
      tone: mineSide ? "mine" : "theirs",
      title: `${top.p.name} is worth ${Math.round(v.swing * 100)} points of win chance in ${l.name}`,
      body:
        `${mineSide ? "Yours" : `${l.opponent}'s`}, still to play (projected ${proj != null ? r1(proj) : "—"}, 80% range ${r1(v.final.floor)}–${r1(v.final.ceiling)}). ` +
        `Your win chance is ${pc(v.base)} now: ${pc(v.atCeiling)} if he hits his ceiling, ${pc(v.atMedian)} at his median, ${pc(v.atFloor)} at his floor. ` +
        `The biggest single-player swing in this matchup; the projected gap is ${r1(gap)} ${leading ? "in your favor" : "against you"}. ${need}`.trim(),
      player: chip(top.p),
      league: l.name,
      priority: 90 - Math.round(Math.abs(l.win - 0.5) * 40),
    });
  }
  return cards;
}

function threats(ls, gameStates) {
  const cards = [];
  for (const l of ls) {
    if (l.done || l.win == null || l.win >= 0.5) continue;
    const best = l.opp
      .filter((p) => p.id && !p.out && p.st === "pre" && num(p.proj) != null)
      .sort((a, b) => b.proj - a.proj)[0];
    if (!best) continue;
    const v = lev(l, "opp", best, gameStates);
    cards.push({
      id: `threat:${l.id}`,
      kind: "threat",
      label: "Their best card",
      tone: "theirs",
      title: `${best.name} is ${l.opponent}'s biggest threat`,
      body: v
        ? `Projected ${r1(best.proj)} in ${l.name}. You're ${pc(v.base)} to win; a ceiling game (${r1(v.final.ceiling)}) drops that to ${pc(v.atCeiling)}, a floor game (${r1(v.final.floor)}) lifts it to ${pc(v.atFloor)}. His game alone moves your odds ${Math.round(v.swing * 100)} points.`
        : `Projected ${r1(best.proj)} in ${l.name}, where you're ${pc(l.win)} to win. A quiet game from him is your way back.`,
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

// Expected wins across leagues if one player's game lands at his floor / median / ceiling (sum of each league's win chance with him
// pinned; `entries` = [{ l, p, side }]). The change from `base` is the player's whole effect on the week.
function expectedWins(entries, gameStates) {
  const out = { base: 0, floor: 0, median: 0, ceiling: 0, rows: [] };
  for (const { l, p, side } of entries) {
    const v = lev(l, side, p, gameStates);
    if (!v) continue;
    out.base += v.base;
    out.floor += v.atFloor;
    out.median += v.atMedian;
    out.ceiling += v.atCeiling;
    out.rows.push({ l, side, v });
  }
  return out;
}
const ew = (v) => (Math.round(v * 100) / 100).toFixed(2);
const dw = (v) => `${v >= 0 ? "+" : "−"}${ew(Math.abs(v))}`;

function exposure(ls, gameStates) {
  const mine = new Map();
  const against = new Map();
  for (const l of ls) {
    for (const p of l.mine) if (p.id) mine.set(p.id, [...(mine.get(p.id) || []), { l, p, side: "mine" }]);
    for (const p of l.opp) if (p.id) against.set(p.id, [...(against.get(p.id) || []), { l, p, side: "opp" }]);
  }
  const cards = [];
  const multi = [...mine.values()]
    .filter((v) => v.length >= 2 && v.some(({ p }) => p.st === "pre" || p.st === "in"))
    .sort((a, b) => b.length - a.length || (b[0].p.proj || 0) - (a[0].p.proj || 0))[0];
  if (multi) {
    const p = multi[0].p;
    const x = expectedWins(multi, gameStates);
    const worst = [...x.rows].sort((a, b) => b.v.swing - a.v.swing)[0];
    cards.push({
      id: `exposure:${p.id}`,
      kind: "exposure",
      label: "Big exposure",
      tone: "mine",
      title: `${p.name} starts in ${multi.length} of your leagues`,
      body: x.rows.length
        ? `Projected ${r1(p.proj || 0)}. Across the ${x.rows.length} matchups you expect ${ew(x.base)} wins now; his ceiling takes that to ${ew(x.ceiling)} (${dw(x.ceiling - x.base)}), his floor to ${ew(x.floor)} (${dw(x.floor - x.base)}). He is a ${x.rows.length}x position, so one game moves ${ew(x.ceiling - x.floor)} wins either way.${worst ? ` Most sensitive: ${worst.l.name} (${pc(worst.v.atFloor)} to ${pc(worst.v.atCeiling)}).` : ""}`
        : `A big game moves ${multi.length} matchups at once, and a dud costs you in all of them. Projected ${r1(p.proj || 0)}.`,
      player: chip(p),
      priority: 62,
    });
  }
  for (const [id, own] of mine) {
    const foes = against.get(id);
    if (!foes) continue;
    const p = own[0].p;
    if (p.st === "post") continue;
    const x = expectedWins([...own, ...foes], gameStates);
    const hedged = x.rows.length ? Math.abs(x.ceiling - x.floor) : null;
    cards.push({
      id: `hedge:${id}`,
      kind: "exposure",
      label: "Both sides",
      tone: "neutral",
      title: `${p.name} is on both sides of your week`,
      body: x.rows.length
        ? `You start him in ${own.map((o) => o.l.name).join(", ")}; he plays against you in ${foes.map((o) => o.l.name).join(", ")}. At his ceiling your expected wins move ${dw(x.ceiling - x.base)} net, at his floor ${dw(x.floor - x.base)}, so the hedge ${hedged < 0.15 ? "cancels almost all of his effect" : hedged < 0.4 ? "absorbs part of his effect" : "leaves you mostly exposed one way"}.`
        : `You start him in ${own.map((o) => o.l.name).join(", ")}; he plays against you in ${foes.map((o) => o.l.name).join(", ")}. A big game is good in some matchups and bad in others.`,
      player: chip(p),
      priority: 64,
    });
    break;
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
  add(lineupCards(savedTeams, gameStates, adjusted));
  add(outlook(ls));
  add(swings(ls, gameStates));
  add(threats(ls, gameStates));
  add(exposure(ls, gameStates));
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

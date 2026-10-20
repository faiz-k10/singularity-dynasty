// The Game Board's companion pane (app/my-team/Companion.js): short, plain-English cards that always have something to say about
// the viewer's leagues -- before kickoff (swing players, closest matchups, lineup holes, best on the waiver wire), during games
// (the same swing watch, on live numbers), after them (best and worst performers, who decided each matchup) and all week
// (playoff picture, exposure across leagues). Pure, no imports; tested in test/companion.test.mjs. It is rules over the numbers
// the board already holds (lineups with projection / floor / ceiling / points, win chances, standings, the waiver list) -- not a
// language model, and nothing here is stored.
//
// savedTeams: saved_teams rows (settings.h2h.mine / .opp = { id, slot, name, pos, team, proj, floor, ceiling, pts, out }).
// gameStates: lib/gameStatus.js (team -> { state: "pre" | "in" | "post" }).
// waivers: { [teamId]: [{ name, pos, team, proj, adds }] } best available per league, optional.

const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const sgn = (v) => `${v >= 0 ? "+" : "−"}${r1(Math.abs(v))}`;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const leagueOf = (t) => t.league_name || t.team_name || "your league";
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

function leagues(savedTeams, gameStates) {
  const out = [];
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.bestBall || s.isBye || !s.h2h?.mine?.length || !s.h2h?.opp?.length) continue;
    const mine = s.h2h.mine.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const opp = s.h2h.opp.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const total = (rows) => rows.reduce((a, p) => a + worth(p, p.st), 0);
    const all = [...mine, ...opp];
    const done = all.every((p) => p.st === "post" || p.st === "none" || !p.id);
    const anyPlayed = all.some((p) => p.st === "post" || p.st === "in");
    out.push({
      t,
      id: t.id,
      name: leagueOf(t),
      opponent: s.opponent || "your opponent",
      mine,
      opp,
      margin: total(mine) - total(opp), // projected (played games at their points)
      win: num(s.winChance),
      live: s.matchupActual || null,
      done: done && anyPlayed,
      anyPlayed,
    });
  }
  return out;
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

function swings(ls) {
  const open = ls
    .filter((l) => l.win != null && !l.done)
    .sort((a, b) => Math.abs(a.win - 0.5) - Math.abs(b.win - 0.5))
    .slice(0, 3);
  const cards = [];
  for (const l of open) {
    const cand = [];
    for (const [side, rows] of [["mine", l.mine], ["opp", l.opp]]) {
      for (const p of rows) {
        if (!p.id || p.out || (p.st !== "pre" && p.st !== "in")) continue;
        const proj = num(p.proj);
        const ceil = num(p.ceiling);
        const floor = num(p.floor);
        if (proj == null || ceil == null || floor == null) continue;
        cand.push({ p, side, up: ceil - proj, down: proj - floor, spread: ceil - floor });
      }
    }
    if (!cand.length) continue;
    const top = cand.sort((a, b) => b.spread - a.spread)[0];
    const mineSide = top.side === "mine";
    const gap = Math.abs(l.margin);
    const leading = l.margin >= 0;
    const verb = mineSide
      ? `A ceiling game adds ${r1(top.up)} to your side; a floor game takes ${r1(top.down)} away.`
      : `If he hits his ceiling he adds ${r1(top.up)} for them; if he busts you gain ${r1(top.down)}.`;
    cards.push({
      id: `swing:${l.id}`,
      kind: "swing",
      label: "Swing player",
      tone: mineSide ? "mine" : "theirs",
      title: `${top.p.name} could decide ${l.name}`,
      body: `${mineSide ? "Yours" : `${l.opponent}'s`}, still to play, range ${r1(top.p.floor)}–${r1(top.p.ceiling)}. ${verb} The projected gap is ${r1(gap)} points ${leading ? "in your favor" : "against you"}.`,
      player: chip(top.p),
      league: l.name,
      priority: 90 - Math.round(Math.abs(l.win - 0.5) * 40),
    });
  }
  return cards;
}

function threats(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done || l.win == null || l.win >= 0.5) continue;
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
      body: `Projected ${r1(best.proj)} in ${l.name}, where you're ${Math.round(l.win * 100)}% to win. A quiet game from him is your way back.`,
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

function exposure(ls) {
  const mine = new Map();
  const against = new Map();
  for (const l of ls) {
    for (const p of l.mine) if (p.id) mine.set(p.id, [...(mine.get(p.id) || []), { l, p }]);
    for (const p of l.opp) if (p.id) against.set(p.id, [...(against.get(p.id) || []), { l, p }]);
  }
  const cards = [];
  const multi = [...mine.values()]
    .filter((v) => v.length >= 2 && v.some(({ p }) => p.st === "pre" || p.st === "in"))
    .sort((a, b) => b.length - a.length || (b[0].p.proj || 0) - (a[0].p.proj || 0))[0];
  if (multi) {
    const p = multi[0].p;
    cards.push({
      id: `exposure:${p.id}`,
      kind: "exposure",
      label: "Big exposure",
      tone: "mine",
      title: `${p.name} starts in ${multi.length} of your leagues`,
      body: `A big game moves ${multi.length} matchups at once, and a dud costs you in all of them. Projected ${r1(p.proj || 0)}.`,
      player: chip(p),
      priority: 62,
    });
  }
  for (const [id, own] of mine) {
    const foes = against.get(id);
    if (!foes) continue;
    const p = own[0].p;
    if (p.st === "post") continue;
    cards.push({
      id: `hedge:${id}`,
      kind: "exposure",
      label: "Both sides",
      tone: "neutral",
      title: `${p.name} is on both sides of your week`,
      body: `You start him in ${own.map((o) => o.l.name).join(", ")}; he plays against you in ${foes.map((o) => o.l.name).join(", ")}. A big game is good in some matchups and bad in others.`,
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
      body: `Projected ${r1(best.w.proj)}, ${r1(best.gain)} more than ${best.weakest.name} (${r1(best.weakest.proj)}), your lowest ${best.w.pos} starter.${best.w.adds > 500 ? ` Trending: added ${best.w.adds >= 1000 ? `${Math.round(best.w.adds / 1000)}k` : best.w.adds} times in 24 hours.` : ""}`,
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

// Overall state of the week across the viewer's lineups.
export function weekPhase(savedTeams, gameStates) {
  if (!gameStates) return "unknown";
  let pre = 0;
  let live = 0;
  let post = 0;
  for (const l of leagues(savedTeams, gameStates)) {
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
}

// All cards for the viewer's leagues, best first for the current phase.
export function buildInsights({ savedTeams, gameStates, waivers = null }) {
  const phase = weekPhase(savedTeams, gameStates);
  const ls = leagues(savedTeams, gameStates);
  const cards = [];
  const add = (c) => (Array.isArray(c) ? cards.push(...c) : c && cards.push(c));
  add(holes(ls));
  add(outlook(ls));
  add(swings(ls));
  add(threats(ls));
  add(exposure(ls));
  add(waiverCards(ls, waivers));
  add(recaps(ls));
  add(season(savedTeams));
  add(tidbits(ls));
  // Once the games are over, the recap leads; before them, the previews do.
  if (phase === "recap" || phase === "off") for (const c of cards) if (c.kind === "recap") c.priority += 15;
  if (phase === "preview") for (const c of cards) if (c.kind === "alert" || c.kind === "waiver") c.priority += 6;
  cards.sort((a, b) => b.priority - a.priority);
  return { phase, cards };
}

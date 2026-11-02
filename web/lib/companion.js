// The Game Board's companion pane (app/my-team/Companion.js): short cards about the viewer's leagues, written for someone who doesn't speak
// stats -- "we expect about 15", "could score anywhere from 4 to 26", "that's one catch" -- never "median", "floor / ceiling", "projected gap".
// Before kickoff: lineup holes and upgrades, wild cards, danger men, matchups, free pickups. During games: comeback watch, nail-biters, who is
// carrying a matchup. After them: stars, letdowns, points left on the bench, the week's MVP. All week: the playoff race, standings, luck,
// and trivia ("Did you know?", your season as an NFL record, stacks) so the pane always has something worth a glance.
// Rules over the numbers the board already holds (lineups with projection / floor / ceiling / points, benches, standings, the waiver list,
// each player's matchup trend and badges) -- not a language model, nothing stored, and no card uses a win probability (that model has not
// been backtested; playoff odds have). Pure; tested in test/companion.test.mjs.
//
// savedTeams: saved_teams rows (settings.h2h.mine / .opp / .mineBench = { id, slot, name, pos, team, proj, floor, ceiling, pts, out }).
// gameStates: lib/gameStatus.js (team -> { state: "pre" | "in" | "post", start }).
// waivers: { [teamId]: [{ name, pos, team, proj }] } best available per league, optional.

import { lineupAdvice, slotLabel } from "./lineupOptimizer.js";
import { ELIGIBLE } from "./lineupSlots.js";
import { num, leagueName, fmt1, ordinal } from "./format.js";

const about = (v) => `about ${Math.round(v)}`;
const leagueOf = (t) => leagueName(t, "your league");
const chip = (p) => (p ? { name: p.name, pos: p.pos ?? p.position, team: p.team } : null);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (rows, max = 3) => {
  const list = rows.slice(0, max).map((p) => p.name);
  const more = rows.length - list.length;
  if (more > 0) return `${list.join(", ")} and ${plural(more, "more", "more")}`;
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0] || "";
};
// "Blue Ridge Ghosts'" / "Rival's": a fantasy team's possessive.
const poss = (name) => `${name}${/s$/i.test(name) ? "'" : "'s"}`;
const POS_WORD = { QB: "quarterback", RB: "running backs", WR: "receivers", TE: "tight end" };

// A points gap in football terms (PPR: a catch is 1 point, 10 yards 1 point, a touchdown 6), so "3.4" reads as something you can picture.
export function inFootball(gap) {
  const g = Math.abs(gap);
  if (g < 1) return "less than a single catch";
  if (g < 1.5) return "one catch";
  if (g < 3) return `${Math.round(g * 10)} yards`;
  if (g < 5) return `one catch and ${Math.round((g - 1) * 10)} yards`;
  if (g < 7.5) return "one touchdown";
  if (g < 10) return "a touchdown and a couple of catches";
  return `about ${Math.round(g / 6)} touchdowns`;
}

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
// The points a lineup spot is still expected to add (0 once his game is over).
const stillToCome = (p) => (!p?.id || p.out ? 0 : p.st === "pre" ? num(p.proj) ?? 0 : p.st === "in" ? Math.max(0, (num(p.proj) ?? 0) - (num(p.pts) ?? 0)) : 0);
const stillToPlay = (p) => p.id && !p.out && (p.st === "pre" || p.st === "in");

// `adjusted` (optional): { [teamId]: matchupState() result } from the Game Board, so the lineups and the live totals here
// are the very same numbers the league cards show (the plays Sleeper hasn't posted yet included); without it, the saved snapshot.
function leagues(savedTeams, gameStates, adjusted = null) {
  const out = [];
  for (const t of savedTeams || []) {
    const s = t.settings || {};
    if (s.isBye || !s.h2h?.mine?.length || !s.h2h?.opp?.length) continue;
    const adj = adjusted?.[t.id]?.adj || null;
    const h2h = adj ? adj.lists : s.h2h;
    const mine = h2h.mine.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const opp = h2h.opp.map((p) => ({ ...p, st: stateOf(p, gameStates) }));
    const bench = (s.h2h.mineBench || []).map((p) => ({ ...p, st: stateOf(p, gameStates) }));
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
      bench,
      margin: total(mine) - total(opp), // expected final margin (played games at their points)
      live: (adj ? adj.live : s.matchupActual) || null,
      done: done && anyPlayed,
      anyPlayed,
    });
  }
  return out;
}

// ---- before and during games ------------------------------------------------------------------------------------------------

// Lineup upgrades: the biggest swap per league from the optimizer (lib/lineupOptimizer.js: median + Smash / Tough Spot). Only while someone in the
// lineup can still move.
function lineupCards(savedTeams, gameStates, adjusted, injuriesByTeam) {
  const cards = [];
  for (const t of savedTeams || []) {
    // The board already worked the advice out for its alert counts (row.alertCount.advice); only compute it when running without the board.
    const a = adjusted?.[t.id]?.row ? adjusted[t.id].row.alertCount.advice : lineupAdvice(t, gameStates, injuriesByTeam?.[t.id]);
    if (!a || !a.swaps.length || a.gain < 1) continue;
    const top = a.swaps[0];
    const inn = top.in;
    const out = top.out;
    const why = out?.unavailable
      ? ` ${out.name} is listed out.`
      : inn.myLean?.effect > 0
        ? ` ${inn.name} also has an easy matchup this week.`
        : out?.myLean?.effect < 0
          ? ` ${out.name} has a tough matchup this week.`
          : "";
    const more = a.swaps.length > 1 ? ` ${plural(a.swaps.length - 1, "more change")} on the Lineup Alerts tab, ${fmt1(a.gain)} points in all.` : "";
    cards.push({
      id: `lineup:${t.id}`,
      kind: "lineup",
      label: "Lineup upgrade",
      tone: "mine",
      title: out ? `Start ${inn.name} over ${out.name}` : `Fill your empty ${slotLabel(top.slot)} spot with ${inn.name}`,
      body: out
        ? `We expect ${inn.name} to score ${about(inn.myProjPts)} and ${out.name} ${about(out.myProjPts)}: ${fmt1(top.gain)} more points for one switch.${why}${more}`
        : `An empty spot scores zero; ${inn.name} should be good for ${about(inn.myProjPts)}.${more}`,
      player: chip({ name: inn.name, pos: inn.position, team: inn.team }),
      league: leagueOf(t),
      priority: 92 + Math.min(5, Math.round(a.gain / 3)),
    });
  }
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

// The week across your leagues on paper (lineups at what we expect; games already played at their points).
function outlook(ls) {
  const open = ls.filter((l) => !l.done);
  if (open.length < 2) return null;
  const ahead = open.filter((l) => l.margin >= 0).length;
  const closest = [...open].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];
  const toughest = [...open].sort((a, b) => a.margin - b.margin)[0];
  const safest = [...open].sort((a, b) => b.margin - a.margin)[0];
  const close = `Closest call: ${closest.name}, ${Math.abs(closest.margin) < 1 ? "dead even" : `${fmt1(Math.abs(closest.margin))} points either way, which is ${inFootball(closest.margin)}`}.`;
  const edge =
    toughest.margin < -3 && toughest !== closest
      ? ` Uphill: ${toughest.name}, where you're behind by ${fmt1(-toughest.margin)} on paper. It'll take a big day.`
      : safest.margin > 3 && safest !== closest
        ? ` Safest: ${safest.name}, ahead by ${fmt1(safest.margin)} on paper.`
        : "";
  return {
    id: "outlook",
    kind: "outlook",
    label: "On paper",
    tone: ahead * 2 >= open.length ? "mine" : "theirs",
    title: `On paper, you win ${ahead} of your ${open.length} matchups`,
    body: `${close}${edge}`,
    priority: 70,
  };
}

// The widest-range player still to play in your closest matchups, either side: could his game alone decide it?
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
        if (!stillToPlay(p) || num(p.ceiling) == null || num(p.floor) == null || num(p.proj) == null) continue;
        const spread = p.ceiling - p.floor;
        if (!top || spread > top.spread) top = { p, side, spread };
      }
    if (!top) continue;
    const { p } = top;
    const mineSide = top.side === "mine";
    const gap = Math.abs(l.margin);
    const up = p.ceiling - p.proj;
    const down = p.proj - p.floor;
    const decides =
      Math.min(up, down) > gap
        ? "whichever version of him shows up could decide it on his own."
        : Math.max(up, down) > gap
          ? "one big (or bad) day from him could flip it."
          : "even his best or worst day probably won't flip it by itself.";
    cards.push({
      id: `swing:${l.id}`,
      kind: "swing",
      label: "Wild card",
      tone: mineSide ? "mine" : "theirs",
      title: `${mineSide ? "" : `${poss(l.opponent)} `}${p.name} could swing ${l.name}`,
      body: `He could score anywhere from ${fmt1(p.floor)} to ${fmt1(p.ceiling)}. ${gap < 0.5 ? "This matchup is dead even on paper" : `This matchup looks like it'll be decided by ${fmt1(gap)} points (${inFootball(gap)})`}, so ${decides}`,
      player: chip(p),
      league: l.name,
      priority: 90 - Math.min(30, Math.round(gap)),
    });
  }
  return cards;
}

// Where you're behind on paper: the opponent's best player still to play.
function threats(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done || l.margin >= 0 || -l.margin > 15) continue; // a gap one off day could close
    const best = l.opp.filter((p) => stillToPlay(p) && p.st === "pre" && num(p.proj) != null).sort((a, b) => b.proj - a.proj)[0];
    if (!best) continue;
    cards.push({
      id: `threat:${l.id}`,
      kind: "threat",
      label: "Danger man",
      tone: "theirs",
      title: `Watch out for ${best.name}`,
      body:
        `${poss(l.opponent)} best player still to play in ${l.name}: we expect ${about(best.proj)} from him, and you're behind by ${fmt1(-l.margin)} on paper.` +
        (num(best.floor) != null ? ` You need him to have an off day (his bad days look like ${fmt1(best.floor)}).` : ""),
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
      const slot = slotLabel(p.slot || "") || "lineup";
      cards.push({
        id: `hole:${l.id}:${p.slot}:${p.id || "empty"}`,
        kind: "alert",
        label: "Fix before kickoff",
        tone: "alert",
        title: empty ? `Empty ${slot} spot in ${l.name}` : `${p.name} won't play, but he's in your lineup`,
        body: empty ? "Nobody is starting there, so it scores zero. Put someone in before kickoff." : `He's in your ${slot} spot in ${l.name} and will score zero. Swap him out before kickoff.`,
        player: out ? chip(p) : null,
        league: l.name,
        priority: 100,
      });
    }
  }
  return cards.slice(0, 3);
}

// A player in several of your lineups, and a player who is on your side in some leagues and against you in others.
function exposure(ls) {
  const mine = new Map();
  const against = new Map();
  for (const l of ls) {
    for (const p of l.mine) if (p.id) mine.set(p.id, [...(mine.get(p.id) || []), { l, p }]);
    for (const p of l.opp) if (p.id) against.set(p.id, [...(against.get(p.id) || []), { l, p }]);
  }
  const cards = [];
  const multi = [...mine.values()]
    .filter((v) => v.length >= 2 && v.some(({ p }) => stillToPlay(p)) && num(v[0].p.proj) != null)
    .sort((a, b) => b.length - a.length || (b[0].p.proj || 0) - (a[0].p.proj || 0))[0];
  if (multi) {
    const p = multi[0].p;
    const n = multi.length;
    const swing = num(p.floor) != null && num(p.ceiling) != null ? ` On a great day he's worth ${Math.round(n * p.ceiling)} points to you across them; on a bad one, ${Math.round(n * p.floor)}.` : "";
    cards.push({
      id: `exposure:${p.id}`,
      kind: "exposure",
      label: "All your eggs",
      tone: "mine",
      title: `${p.name} is in ${n} of your lineups`,
      body: `Whatever he does, you get it ${n} times over.${swing}`,
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
      label: "Rooting for and against",
      tone: "fun",
      title: `You need ${p.name} to boom and bust`,
      body:
        `He's in your lineup in ${own.map((o) => o.l.name).join(", ")}, and in your opponent's in ${foes.map((o) => o.l.name).join(", ")}. ` +
        (net === 0 ? "Every touchdown he scores helps you once and hurts you once." : net > 0 ? "You start him more often than you face him, so root for the big day." : "You face him more often than you start him, so a quiet day suits you."),
      player: chip(p),
      priority: 64,
    });
    break;
  }
  return cards;
}

// Stacks: a quarterback starting with one of his own receivers (every touchdown pass counts twice), or three-plus starters from one NFL team.
function stacks(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done) continue;
    const live = l.mine.filter((p) => stillToPlay(p) && p.team);
    const qb = live.find((q) => q.pos === "QB" && live.some((r) => r.team === q.team && (r.pos === "WR" || r.pos === "TE")));
    if (qb) {
      const catchers = live.filter((r) => r.team === qb.team && (r.pos === "WR" || r.pos === "TE"));
      cards.push({
        id: `stack:${l.id}`,
        kind: "fun",
        label: "Stacked",
        tone: "fun",
        title: `${qb.name} throwing to ${names(catchers, 2)}`,
        body: `You start both ends of the pass in ${l.name}. Every touchdown between them pays you twice: once for the throw, once for the catch.`,
        player: chip(qb),
        league: l.name,
        priority: 63,
      });
      continue;
    }
    const byTeam = new Map();
    for (const p of live) byTeam.set(p.team, [...(byTeam.get(p.team) || []), p]);
    const pile = [...byTeam.values()].sort((a, b) => b.length - a.length)[0];
    if (pile?.length >= 3)
      cards.push({
        id: `stack:${l.id}`,
        kind: "fun",
        label: "All in",
        tone: "fun",
        title: `${pile.length} of your ${l.name} starters play for ${pile[0].team}`,
        body: `${names(pile)}. When that offense moves the ball, you score. When it stalls, so do you.`,
        player: chip(pile[0]),
        league: l.name,
        priority: 61,
      });
  }
  return cards.slice(0, 2);
}

// Live: you're behind now but your players still to come should carry you (Comeback watch), or ahead now but theirs should catch you (Hang on).
function comebacks(ls) {
  const cards = [];
  for (const l of ls) {
    if (l.done || !l.anyPlayed || !l.live) continue;
    const now = l.live.mine - l.live.opp;
    const minePending = l.mine.filter(stillToPlay);
    const oppPending = l.opp.filter(stillToPlay);
    const addMine = minePending.reduce((a, p) => a + stillToCome(p), 0);
    const addOpp = oppPending.reduce((a, p) => a + stillToCome(p), 0);
    if (now < -1 && l.margin > 1 && minePending.length) {
      cards.push({
        id: `comeback:${l.id}`,
        kind: "live",
        label: "Comeback watch",
        tone: "mine",
        title: `Down ${fmt1(-now)}, but help is on the way in ${l.name}`,
        body: `You still have ${names(minePending)} to play, worth ${about(addMine)} more points${oppPending.length ? ` (${l.opponent} has ${about(addOpp)} left)` : ` (${l.opponent} is done)`}. That should be enough to finish ahead by ${about(l.margin)}.`,
        player: chip(minePending.sort((a, b) => stillToCome(b) - stillToCome(a))[0]),
        league: l.name,
        priority: 91,
      });
    } else if (now > 1 && l.margin < -1 && oppPending.length) {
      cards.push({
        id: `comeback:${l.id}`,
        kind: "live",
        label: "Hang on",
        tone: "theirs",
        title: `You're up ${fmt1(now)} in ${l.name}, but it's slipping`,
        body: `${l.opponent} still has ${names(oppPending)} to play, worth ${about(addOpp)} more points. You have ${minePending.length ? `${about(addMine)} left` : "nobody left"}. On paper they finish ahead by ${about(-l.margin)}.`,
        player: chip(oppPending.sort((a, b) => stillToCome(b) - stillToCome(a))[0]),
        league: l.name,
        priority: 90,
      });
    }
  }
  return cards.slice(0, 2);
}

// A matchup separated by less than a touchdown, live or final.
function nailBiters(ls) {
  const cards = [];
  for (const l of ls) {
    if (!l.anyPlayed || !l.live) continue;
    const d = l.live.mine - l.live.opp;
    if (Math.abs(d) >= 5 || (!l.done && Math.abs(l.margin) >= 8)) continue;
    const left = [l.mine.filter(stillToPlay).length, l.opp.filter(stillToPlay).length];
    cards.push({
      id: `close:${l.id}`,
      kind: l.done ? "recap" : "live",
      label: "Nail-biter",
      tone: d >= 0 ? "mine" : "theirs",
      title: l.done ? `${l.name} came down to ${fmt1(Math.abs(d))} points` : `${fmt1(Math.abs(d))} points separate you in ${l.name}`,
      body: l.done
        ? `That's ${inFootball(d)}. ${d > 0 ? "You survived it." : "That one stings."}`
        : `That's ${inFootball(d)}. ${d >= 0 ? "You're ahead" : "You're behind"}, with ${plural(left[0], "player")} of yours and ${plural(left[1], "player")} of theirs still to play. Every snap counts.`,
      league: l.name,
      priority: l.done ? 83 : 89,
    });
  }
  return cards.sort((a, b) => b.priority - a.priority).slice(0, 2);
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
    if (t.settings?.isBye) continue;
    for (const p of startersToPlay(t, gameStates)) {
      if (num(p.myLean?.effect) == null) continue;
      const cur = byId.get(p.player_id) || { p, leagues: 0 };
      cur.leagues++;
      byId.set(p.player_id, cur);
    }
  }
  const all = [...byId.values()];
  const smash = all.filter((x) => x.p.myLean.effect > 0).sort((a, b) => b.p.myLean.effect - a.p.myLean.effect);
  const tough = all.filter((x) => x.p.myLean.effect < 0).sort((a, b) => a.p.myLean.effect - b.p.myLean.effect);
  if (!smash.length && !tough.length) return null;
  const list = (xs) => xs.map((x) => `${x.p.name} (${x.p.myLean.effect > 0 ? "+" : "−"}${fmt1(Math.abs(x.p.myLean.effect))})`).join(", ");
  const lead = smash[0] || tough[0];
  return {
    id: "matchup-trends",
    kind: "trend",
    label: "Matchups",
    tone: smash.length >= tough.length ? "mine" : "theirs",
    title: smash.length ? `${plural(smash.length, "starter")} of yours ${smash.length === 1 ? "has" : "have"} an easy matchup${tough.length ? `, ${tough.length} a tough one` : ""}` : `${plural(tough.length, "starter")} of yours ${tough.length === 1 ? "faces" : "face"} a tough defense`,
    body: `${smash.length ? `Easy: ${list(smash)}. ` : ""}${tough.length ? `Tough: ${list(tough)}. ` : ""}The number is how many more (or fewer) points that defense usually gives up to his position.`,
    player: chip(lead.p),
    priority: 80,
  };
}

// Form among your starters: On Fire / On Thin Ice (recent points against expected points) and Buy Low / Sell High (opportunity against production).
function formWatch(savedTeams) {
  const seen = new Map();
  for (const t of savedTeams || []) {
    if (t.settings?.isBye) continue;
    for (const p of t.players || []) {
      const flags = ["onFire", "onIce", "buyLow", "sellHigh"].filter((k) => hasBadge(p, k));
      if (!flags.length) continue;
      const cur = seen.get(p.player_id) || { p, flags, started: 0 };
      if (p.isStarter) cur.started++;
      seen.set(p.player_id, cur);
    }
  }
  const all = [...seen.values()];
  const pick = (key, onlyStarters) => all.filter((x) => x.flags.includes(key) && (!onlyStarters || x.started > 0)).map((x) => x.p);
  const fire = pick("onFire", true);
  const ice = pick("onIce", true);
  const cards = [];
  if (fire.length || ice.length) {
    cards.push({
      id: "form",
      kind: "trend",
      label: "Hot and cold",
      tone: fire.length >= ice.length ? "mine" : "theirs",
      title: fire.length ? `${names(fire, 2)} ${fire.length === 1 ? "is" : "are"} on fire` : `${names(ice, 2)} ${ice.length === 1 ? "is" : "are"} ice cold`,
      body: `${fire.length ? `On fire: ${names(fire, 4)}, beating what we expected two weeks running. ` : ""}${ice.length ? `On thin ice: ${names(ice, 4)}, falling short two weeks running.` : ""}`.trim(),
      player: chip(fire[0] || ice[0]),
      priority: 72,
    });
  }
  const buy = pick("buyLow", false);
  const sell = pick("sellHigh", false);
  if (buy.length || sell.length) {
    cards.push({
      id: "value",
      kind: "trend",
      label: "Due for a change",
      tone: "neutral",
      title: buy.length ? `Better days ahead for ${names(buy, 2)}` : `${names(sell, 2)} ${sell.length === 1 ? "is" : "are"} running hot`,
      body: `${buy.length ? `Buy Low: ${names(buy, 4)}. Getting the ball plenty, scoring less than that usually brings, which tends to turn around. ` : ""}${sell.length ? `Sell High: ${names(sell, 4)}. Scoring more than his chances usually bring, which is hard to keep up.` : ""}`.trim(),
      player: chip(buy[0] || sell[0]),
      priority: 52,
    });
  }
  return cards;
}

// How a lineup is built: Steady Eddy badges (rarely surprises) against Risky Icarus badges (big highs, big lows).
function rangeProfile(savedTeams, gameStates) {
  const rows = [];
  for (const t of savedTeams || []) {
    if (t.settings?.isBye) continue;
    const st = startersToPlay(t, gameStates);
    const steady = st.filter((p) => hasBadge(p, "locked"));
    const risky = st.filter((p) => hasBadge(p, "volatile"));
    if (steady.length + risky.length >= 2) rows.push({ t, steady, risky });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => Math.abs(b.risky.length - b.steady.length) - Math.abs(a.risky.length - a.steady.length));
  const top = rows[0];
  const title =
    top.risky.length > top.steady.length
      ? `Your ${leagueOf(top.t)} lineup is a rollercoaster`
      : top.steady.length > top.risky.length
        ? `Your ${leagueOf(top.t)} lineup is built steady`
        : `Your ${leagueOf(top.t)} lineup is half steady, half wild`;
  return {
    id: "range-profile",
    kind: "trend",
    label: "Lineup personality",
    tone: "neutral",
    title,
    body: `${top.risky.length ? `Wild cards (big highs, big lows): ${names(top.risky, 4)}. ` : ""}${top.steady.length ? `Steady (rarely surprises): ${names(top.steady, 4)}.` : ""}`.trim(),
    player: chip(top.risky[0] || top.steady[0]),
    priority: 58,
  };
}

// Position by position in your closest matchups: what each position group is expected to score, yours against theirs (flex slots counted
// at the player's own position).
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
      label: "Where it's won",
      tone: "neutral",
      title: `${l.name}: you win at ${best.g}, lose at ${worst.g}`,
      body: `Your ${POS_WORD[best.g]} should outscore ${poss(l.opponent)} by ${fmt1(best.d)}. Their ${POS_WORD[worst.g]} should outscore yours by ${fmt1(-worst.d)}.`,
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
      label: "Free upgrade",
      tone: "mine",
      title: `${best.w.name} is sitting on the waiver wire in ${l.name}`,
      body:
        best.weakest.proj < 0.5
          ? `Nobody in the league has him, and we expect ${about(best.w.proj)} points. ${best.weakest.name}, your weakest starting ${best.w.pos}, isn't expected to score at all.`
          : `Nobody in the league has him, and we expect ${about(best.w.proj)} points: ${fmt1(best.gain)} more than ${best.weakest.name}, your weakest starting ${best.w.pos}.`,
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
        title: star.p.pts >= 2 * star.p.proj ? `${star.p.name} doubled his number: ${fmt1(star.p.pts)} points` : `${star.p.name} went off for ${fmt1(star.p.pts)} points`,
        body: `We expected ${about(star.p.proj)}. He beat it by ${fmt1(star.delta)} in ${star.l.name}.`,
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
        title: dud.p.pts < 0 ? `${dud.p.name} finished below zero: ${fmt1(dud.p.pts)}` : `${dud.p.name} managed just ${fmt1(dud.p.pts)} points`,
        body: `We expected ${about(dud.p.proj)} in ${dud.l.name}.${dud.p.pts < 0 ? " Below zero means his turnovers cost more than everything else he did earned." : ` That's ${fmt1(-dud.delta)} points short.`}`,
        player: chip(dud.p),
        league: dud.l.name,
        priority: 86,
      });
  }
  // Who moved each matchup: give one player an ordinary day (what we expected of him) and see whether the result flips.
  for (const l of ls) {
    if (!l.anyPlayed) continue;
    const margin = l.live ? l.live.mine - l.live.opp : null;
    if (margin == null || margin === 0) continue;
    const here = rows.filter((r) => r.l === l);
    const flips = here
      .filter((r) => {
        const without = r.side === "mine" ? margin - r.delta : margin + r.delta;
        return Math.sign(without) !== Math.sign(margin) && Math.abs(r.delta) >= 2;
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (flips.length) {
      const f = flips[0];
      const mineSide = f.side === "mine";
      const who = mineSide ? f.p.name : `${poss(l.opponent)} ${f.p.name}`;
      const big = f.delta > 0;
      const without = mineSide ? margin - f.delta : margin + f.delta;
      const title = l.done
        ? mineSide
          ? big ? `${f.p.name} won you ${l.name}` : `${f.p.name}'s off day cost you ${l.name}`
          : big ? `${who} beat you in ${l.name}` : `${f.p.name} had an off day for ${l.opponent} and handed you ${l.name}`
        : mineSide
          ? big ? `${f.p.name} is carrying you in ${l.name}` : `${f.p.name} is the reason you're behind in ${l.name}`
          : big ? `${who} is the reason you're behind in ${l.name}` : `${f.p.name}'s off day for ${l.opponent} has you ahead in ${l.name}`;
      const state = l.done ? (margin > 0 ? "You won" : "You lost") : margin > 0 ? "You're up" : "You're down";
      cards.push({
        id: `flip:${l.id}`,
        kind: "recap",
        label: l.done ? "Decided by one player" : "Moving the matchup",
        tone: margin > 0 ? "mine" : "theirs",
        title,
        body: `${state} by ${fmt1(Math.abs(margin))}. ${f.p.name} scored ${fmt1(f.p.pts)} when we expected ${about(f.p.proj)}. With an ordinary day from him, ${without > 0 ? "you'd be ahead" : "they'd be ahead"} by ${fmt1(Math.abs(without))}.`,
        player: chip(f.p),
        league: l.name,
        priority: 92,
      });
    } else if (l.done) {
      const top = here.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      const who = top ? (top.side === "mine" ? top.p.name : `${poss(l.opponent)} ${top.p.name}`) : null;
      cards.push({
        id: `final:${l.id}`,
        kind: "recap",
        label: "Final",
        tone: margin > 0 ? "mine" : "theirs",
        title: `${margin > 0 ? "Won" : "Lost"} ${l.name} by ${fmt1(Math.abs(margin))}`,
        body: `That's ${inFootball(margin)}. No single player decided it${who ? `; the biggest surprise was ${who}, ${fmt1(Math.abs(top.delta))} ${top.delta > 0 ? "over" : "under"} what we expected` : ""}.`,
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
      title: `You went ${won}-${finished.length - won} this week`,
      body: `${won === finished.length ? "A clean sweep. " : won === 0 ? "A week to forget. " : ""}You averaged ${fmt1(finished.reduce((a, l) => a + l.live.mine, 0) / finished.length)} points a league.`,
      priority: 84,
    });
  }
  return cards;
}

// Points left on the bench: a bench player whose game is over outscored a starter he could have replaced by 5+.
function benchOuch(ls) {
  let best = null;
  for (const l of ls) {
    for (const b of l.bench) {
      if (b.st !== "post" || num(b.pts) == null) continue;
      for (const s of l.mine) {
        if (!s.id || s.st !== "post" || num(s.pts) == null || !ELIGIBLE[s.slot]?.includes(b.pos)) continue;
        const diff = b.pts - s.pts;
        if (diff >= 5 && (!best || diff > best.diff)) best = { l, b, s, diff };
      }
    }
  }
  if (!best) return null;
  const { l, b, s, diff } = best;
  const margin = l.live ? l.live.mine - l.live.opp : null;
  const flips = margin != null && margin < 0 && margin + diff > 0;
  return {
    id: `ouch:${l.id}`,
    kind: "recap",
    label: "Ouch",
    tone: "theirs",
    title: `${fmt1(b.pts)} points sat on your bench`,
    body: `${b.name} scored ${fmt1(b.pts)} on your ${l.name} bench while ${s.name} scored ${fmt1(s.pts)} in your ${slotLabel(s.slot)} spot. That's ${fmt1(diff)} points left on the table${flips ? ", and enough to have won it" : ""}.`,
    player: chip(b),
    league: l.name,
    priority: 87,
  };
}

// The player who earned you the most across leagues (his points times the lineups he's in).
function mvp(ls) {
  const by = new Map();
  for (const l of ls)
    for (const p of l.mine) {
      if (!p.id || (p.st !== "post" && p.st !== "in") || num(p.pts) == null) continue;
      const cur = by.get(p.id) || { p, total: 0, n: 0, each: [] };
      cur.total += p.pts;
      cur.n++;
      cur.each.push(p.pts);
      by.set(p.id, cur);
    }
  const top = [...by.values()].filter((x) => x.n >= 2).sort((a, b) => b.total - a.total)[0];
  if (!top || top.total < 30) return null;
  return {
    id: "mvp",
    kind: "recap",
    label: "MVP of your week",
    tone: "mine",
    title: `${top.p.name}: ${Math.round(top.total)} points for you`,
    body: `He's in ${top.n} of your lineups, so his day counted ${top.n} times over: ${top.each.map(fmt1).join(" + ")}.`,
    player: chip(top.p),
    priority: 85,
  };
}

// ---- all week --------------------------------------------------------------------------------------------------------------

function season(savedTeams) {
  const cards = [];
  const withOdds = (savedTeams || []).filter((t) => num(t.settings?.playoffOdds) != null && !t.settings?.playoffSettled);
  const bubble = [...withOdds].sort((a, b) => Math.abs(a.settings.playoffOdds - 0.5) - Math.abs(b.settings.playoffOdds - 0.5))[0];
  if (bubble) {
    const s = bubble.settings;
    const left = s.season?.weeksLeft;
    cards.push({
      id: "bubble",
      kind: "season",
      label: "Playoff race",
      tone: s.playoffOdds >= 0.5 ? "mine" : "theirs",
      title: `${leagueOf(bubble)} is your nail-biter playoff race`,
      body: `You're ${s.record || "—"} with a ${Math.round(s.playoffOdds * 100)}% chance of making the playoffs${left != null ? ` and ${plural(left, "week")} to go` : ""}. Every win moves it.`,
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
      title: `On track for the playoffs in ${withOdds.filter((t) => t.settings.playoffOdds >= 0.5).length} of ${withOdds.length} leagues`,
      body: safe.length ? `${safe.length} ${safe.length === 1 ? "is" : "are"} all but locked in (a 90% chance or better).` : "None are locked in yet: every league is still in play.",
      priority: 46,
    });
  return cards;
}

// Your season as one NFL team: every league's record added up, stretched over a 17-game season.
function nflRecord(savedTeams) {
  let w = 0;
  let l = 0;
  let n = 0;
  for (const t of savedTeams || []) {
    const me = t.settings?.season?.standings?.find((r) => r.isMe);
    const m = me ? [me.wins, me.losses] : /^(\d+)-(\d+)/.exec(t.settings?.record || "")?.slice(1).map(Number);
    if (!m || !(m[0] + m[1])) continue;
    w += m[0];
    l += m[1];
    n++;
  }
  if (n < 2 || w + l < 6) return null;
  const pct = w / (w + l);
  const w17 = Math.round(pct * 17);
  const verdict = pct >= 0.7 ? "a Super Bowl favorite" : pct >= 0.58 ? "a playoff team" : pct >= 0.45 ? "on the wild-card bubble" : pct >= 0.3 ? "a team whose coach is on the hot seat" : "a team picking first in the draft";
  return {
    id: "nfl-record",
    kind: "fun",
    label: "If you were an NFL team",
    tone: "fun",
    title: `You'd be ${w17}-${17 - w17}: ${verdict}`,
    body: `Across your ${n} leagues you're ${w}-${l} this season, winning ${Math.round(pct * 100)}% of your games. Do that over a 17-game NFL schedule and you go ${w17}-${17 - w17}.`,
    priority: 55,
  };
}

// Luck: the most points scored against you in a league (tough schedule), or a better record than your points deserve.
function luck(savedTeams) {
  let unlucky = null;
  let lucky = null;
  for (const t of savedTeams || []) {
    const rows = t.settings?.season?.standings;
    const me = rows?.find((r) => r.isMe);
    if (!me || rows.length < 6 || !(me.wins + me.losses >= 4)) continue;
    const paRank = 1 + rows.filter((r) => (r.pa ?? 0) > (me.pa ?? 0)).length;
    const pfRank = 1 + rows.filter((r) => (r.pf ?? 0) > (me.pf ?? 0)).length;
    if (paRank <= 2 && (!unlucky || me.pa > unlucky.me.pa)) unlucky = { t, me, paRank, n: rows.length };
    if (me.rank && pfRank - me.rank >= 3 && (!lucky || pfRank - me.rank > lucky.gap)) lucky = { t, me, pfRank, gap: pfRank - me.rank };
  }
  const rec = (m) => `${m.wins}-${m.losses}${m.ties ? `-${m.ties}` : ""}`;
  const cards = [];
  if (unlucky)
    cards.push({
      id: `unlucky:${unlucky.t.id}`,
      kind: "fun",
      label: "Luck meter",
      tone: "theirs",
      title: unlucky.paRank === 1 ? `Nobody in ${leagueOf(unlucky.t)} has had more points scored against them` : `Only one team in ${leagueOf(unlucky.t)} has had more points scored against them`,
      body: `Your opponents have put up ${Math.round(unlucky.me.pa)} points against you. Your ${rec(unlucky.me)} record isn't all on you: it's been a brutal schedule.`,
      league: leagueOf(unlucky.t),
      priority: 56,
    });
  if (lucky)
    cards.push({
      id: `lucky:${lucky.t.id}`,
      kind: "fun",
      label: "Luck meter",
      tone: "mine",
      title: `You're ${ordinal(lucky.me.rank)} in ${leagueOf(lucky.t)} with the ${ordinal(lucky.pfRank)}-most points`,
      body: `Your opponents keep picking the wrong week to have a bad day. Enjoy it: a ${rec(lucky.me)} record beats your scoring.`,
      league: leagueOf(lucky.t),
      priority: 54,
    });
  return cards;
}

// Trivia from the badges: the starter of yours with the most top-3 finishes at his position this season (the Super Hero badge).
function didYouKnow(savedTeams) {
  let best = null;
  for (const t of savedTeams || []) {
    for (const p of t.players || []) {
      const hero = (p.achievements || []).find((a) => a.key === "hero");
      if (!p.isStarter || !(hero?.wins >= 2)) continue;
      if (!best || hero.wins > best.wins) best = { p, wins: hero.wins, t };
    }
  }
  if (!best) return null;
  const { p, wins, t } = best;
  return {
    id: `trivia:${p.player_id}`,
    kind: "fun",
    label: "Did you know?",
    tone: "fun",
    title: `${p.name} has finished top 3 at ${p.position} ${wins} times this season`,
    body: `${wins} weeks on the podium at his position. That's why he wears the Super Hero ball on the rankings. You start him in ${leagueOf(t)}.`,
    player: chip(p),
    priority: 60,
  };
}

function tidbits(ls) {
  const mine = ls.flatMap((l) => l.mine.filter((p) => stillToPlay(p) && num(p.proj) != null).map((p) => ({ p, l })));
  const cards = [];
  if (mine.length) {
    const top = [...mine].sort((a, b) => b.p.proj - a.p.proj)[0];
    cards.push({
      id: "topproj",
      kind: "tidbit",
      label: "Your best bet",
      tone: "mine",
      title: `${top.p.name}: ${about(top.p.proj)} points`,
      body: `The most we expect from anyone you start this week (${top.l.name}).`,
      player: chip(top.p),
      priority: 40,
    });
    const boom = [...mine].filter((x) => num(x.p.ceiling) != null).sort((a, b) => b.p.ceiling - a.p.ceiling)[0];
    if (boom && boom.p.id !== top.p.id)
      cards.push({
        id: "topceil",
        kind: "tidbit",
        label: "Boom potential",
        tone: "mine",
        title: `${boom.p.name} could hit ${fmt1(boom.p.ceiling)}`,
        body: "That's his great-day number: he gets there about one week in ten. Nobody else you start has a higher one.",
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
      body: `${[main, ...rest.slice(0, 1)].map((l) => l.plain || l.text).join(". ")}.${where}`,
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
    label: "Injury watch",
    tone: worst.severity >= 2 ? "alert" : "neutral",
    title: `${plural(list.length, "starter")} of yours ${list.length === 1 ? "is" : "are"} banged up`,
    body:
      list.slice(0, 4).map((h) => `${h.name} (${h.status}${h.leagues.size > 1 ? `, ${h.leagues.size} leagues` : ""})`).join("; ") +
      (list.length > 4 ? `; and ${list.length - 4} more` : "") +
      `.${worst.severity >= 2 ? " Have a backup ready." : ""}`,
    count: list.length,
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
  const rec = (m) => `${m.wins}-${m.losses}${m.ties ? `-${m.ties}` : ""}`;
  return {
    id: "standings",
    kind: "season",
    label: "Standings",
    tone: best.me.rank / best.n <= 0.34 ? "mine" : "neutral",
    title: best.me.rank === 1 ? `You're in first place in ${leagueOf(best.t)}` : `Your best spot: ${ordinal(best.me.rank)} of ${best.n} in ${leagueOf(best.t)}`,
    body: `${rec(best.me)}, ${Math.round(best.me.pf)} points scored.${rows.length > 1 && worst !== best ? ` Toughest: ${ordinal(worst.me.rank)} of ${worst.n} in ${leagueOf(worst.t)} (${rec(worst.me)}).` : ""}`,
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
    const night = (day === "Monday" || day === "Thursday") && first.getHours() >= 18;
    return {
      id: "today",
      kind: "today",
      label,
      tone: "mine",
      title: night
        ? `It comes down to ${day} night: ${mine.size ? `${plural(mine.size, "starter")} of yours` : `${plural(theirs.size, "starter")} of theirs`}`
        : mine.size
          ? `${plural(mine.size, "starter")} of yours ${mine.size === 1 ? "plays" : "play"} today`
          : `${plural(theirs.size, "starter")} of your opponents' ${theirs.size === 1 ? "plays" : "play"} today`,
      body: `First kickoff ${clock(first)}.${windows.size > 1 ? ` By kickoff: ${[...windows].map(([k, n]) => `${k} (${n})`).join(", ")}.` : ""}${theirs.size && mine.size ? ` Your opponents have ${theirs.size} in action too.` : ""}${top ? ` Your biggest name: ${top.name}.` : ""}`,
      player: top ? chip(top) : null,
      priority: 94,
    };
  }
  const base = { id: "today", kind: "today", label, tone: "neutral", priority: 85 };
  if (day === "Tuesday")
    return {
      ...base,
      tone: "mine",
      title: "New week, new numbers",
      body: feed?.ready ? `Week ${feed.week}'s projections are out. ${plural(feed.all?.starters ?? 0, "starter")} of yours moved since week ${feed.prevWeek}; the changes are below.` : "This week's projections come out today. Everything here fills in as they land.",
    };
  if (day === "Wednesday") {
    let best = null;
    for (const l of ls) for (const w of waivers?.[l.id] || []) if (!best || w.proj > best.w.proj) best = { w, l };
    return {
      ...base,
      tone: "mine",
      title: "Waiver day",
      body: best ? `The best free player in any of your leagues: ${best.w.name} (${best.w.pos}), ${about(best.w.proj)} points expected in ${best.l.name}. Claims usually go through overnight.` : "Claims usually go through overnight. Each league's Best available tab shows who's worth one.",
      player: best ? chip(best.w) : null,
    };
  }
  if (day === "Thursday") return { ...base, title: "Football is back tonight", body: "Set your lineups before kickoff: tonight's players lock the moment their game starts." };
  if (day === "Friday" || day === "Saturday")
    return {
      ...base,
      tone: injuryCount ? "alert" : "neutral",
      title: injuryCount ? `${plural(injuryCount, "starter")} to check before Sunday` : "All your starters look healthy",
      body: injuryCount ? "Final injury news lands by Saturday. Have a backup picked for anyone listed Questionable or worse." : "Nothing to fix right now. Final injury news lands by Saturday, so check once more tomorrow.",
    };
  if (day === "Monday") return { ...base, title: "The week is wrapping up", body: "Anything still to play shows up in the cards. Next week's numbers land Tuesday." };
  return { ...base, title: "Game day", body: "Kickoffs and your players in each window show up here as the schedule loads." };
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

// The spotlight turns over the top six cards; one of them is always a fun one (trivia, luck, stacks...) when there is one, so the pane
// never reads like a spreadsheet.
const SPOTLIGHT = 6;

// All cards for the viewer's leagues, best first for the current phase.
export function buildInsights({ savedTeams, gameStates, waivers = null, injuriesByTeam = null, feed = null, teamIndex = null, now = null, adjusted = null }) {
  const ls = leagues(savedTeams, gameStates, adjusted);
  const phase = phaseOf(ls, gameStates);
  const cards = [];
  const add = (c) => (Array.isArray(c) ? cards.push(...c) : c && cards.push(c));
  add(holes(ls));
  add(lineupCards(savedTeams, gameStates, adjusted, injuriesByTeam));
  add(comebacks(ls));
  add(nailBiters(ls));
  add(outlook(ls));
  add(swings(ls));
  add(threats(ls));
  add(exposure(ls));
  add(stacks(ls));
  add(matchupTrends(savedTeams, gameStates));
  add(formWatch(savedTeams));
  add(positionGaps(ls));
  add(rangeProfile(savedTeams, gameStates));
  add(waiverCards(ls, waivers));
  add(recaps(ls));
  add(benchOuch(ls));
  add(mvp(ls));
  add(season(savedTeams));
  add(nflRecord(savedTeams));
  add(luck(savedTeams));
  add(didYouKnow(savedTeams));
  add(tidbits(ls));
  add(changes(feed, teamIndex));
  const inj = injuryCard(ls, injuriesByTeam);
  add(inj);
  add(standingsCard(savedTeams));
  if (now) add(dayCard({ now, ls, gameStates, feed, waivers, injuryCount: inj?.count || 0 }));
  // Once the games are over, the recap leads; before them, the previews do.
  if (phase === "recap" || phase === "off") for (const c of cards) if (c.kind === "recap") c.priority += 15;
  if (phase === "preview") for (const c of cards) if (c.kind === "alert" || c.kind === "waiver") c.priority += 6;
  cards.sort((a, b) => b.priority - a.priority);
  const fun = cards.findIndex((c) => c.tone === "fun");
  if (fun >= SPOTLIGHT) cards.splice(SPOTLIGHT - 1, 0, ...cards.splice(fun, 1));
  return { phase, cards };
}

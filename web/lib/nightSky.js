// The Night Sky (Nov 2026, founder): the site's habit loop, built from mockups/night-sky.html and tuned with a season simulation
// (mockups/night-sky-sim.mjs -- rerun it after changing any number here). Pure: used by the server (lib/nightSkyStore.js, which rolls every
// die, so nobody can cheat) and by the page (app/account/sky). Tested in test/nightSky.test.mjs.
//
// The loop: a useful action on the site (each counts once a day) places a star; stars fill constellations (finished ones power up the next
// find) and add mass to the core; every action has a growing chance of collapsing the core, which makes a FIND -- a catalogue object of some
// kind, colour and version. Finds, sets and Beat the Model picks earn orbit points, which climb the reward ladder.
//
// Not gambling (stated on the page): nothing is bought or staked, nothing is for sale, every collapse pays, odds are published, and every
// prize with cash value comes from effort (the ladder) or skill (Beat the Model), never from chance.

export const COLORS = { blue: "#4C7DF0", ember: "#E8643F", white: "#ECE7DC", gold: "#E9C46A" };

// The actions that place a star (each once a day), and the colour of star each tends to place.
export const ACTIONS = {
  board: { label: "Open the Game Board", tool: "My Team", color: "blue", href: "/my-team" },
  waivers: { label: "Check a league's waiver wire", tool: "My Team", color: "blue", href: "/my-team" },
  rankings: { label: "Open the weekly rankings", tool: "Rankings", color: "ember", href: "/tools/redraft-rankings" },
  compare: { label: "Compare players", tool: "Rankings", color: "ember", href: "/tools/compare-players" },
  sims: { label: "Open the season simulations", tool: "Research", color: "white", href: "/tools/player-simulations" },
  lab: { label: "Study players in The Observatory", tool: "Research", color: "white", href: "/tools/lab" },
  dynasty: { label: "Open the Dynasty Board", tool: "Research", color: "white", href: "/tools/draft-board" },
};

// Real constellations (Nov 11 2026, founder): each is drawn from its actual star pattern, brighter stars a little bigger. pts: [x, y, size];
// edges: the lines between stars (pairs of indexes); label: [x, y, text-anchor]. The ORDER of pts is the order stars fill in -- keep the counts
// (4 / 4 / 5 / 10) or saved skies no longer line up.
export const CONSTELLATIONS = [
  // Crux, the Southern Cross: Gacrux, Acrux, Mimosa, Imai.
  { id: "huddle", name: "The Huddle", real: "Crux", color: "blue", size: "small",
    pts: [[-185, -248, 4], [-178, -138, 5], [-228, -200, 4.5], [-148, -182, 3.5]], edges: [[0, 1], [2, 3]], label: [-262, -104, "start"] },
  // Sagitta, the Arrow: the two tail stars, the shaft, the tip.
  { id: "blitz", name: "The Blitz", real: "Sagitta", color: "ember", size: "small",
    pts: [[140, -150, 3.5], [162, -122, 3.5], [192, -180, 4], [245, -235, 4.5]], edges: [[0, 2], [1, 2], [2, 3]], label: [262, -96, "end"] },
  // Cassiopeia, the W: Caph, Schedar, Gamma Cas, Ruchbah, Segin.
  { id: "playbook", name: "The Playbook", real: "Cassiopeia", color: "white", size: "large",
    pts: [[-250, 112, 4.5], [-212, 168, 5], [-176, 126, 5], [-140, 162, 4], [-108, 104, 3.5]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]], label: [-262, 202, "start"] },
  // Orion: Meissa, Betelgeuse, Bellatrix, the belt (Mintaka, Alnilam, Alnitak), the sword, Saiph, Rigel.
  { id: "singularity", name: "The Singularity", real: "Orion", color: "gold", size: "gold",
    pts: [[178, 62, 3.5], [126, 96, 5.5], [224, 106, 4.5], [196, 164, 4], [177, 171, 4.5], [158, 178, 4], [173, 202, 3], [170, 221, 3.5], [138, 250, 4], [234, 240, 5.5]],
    edges: [[0, 1], [0, 2], [1, 5], [2, 3], [3, 4], [4, 5], [5, 8], [3, 9], [4, 6], [6, 7]], label: [262, 274, "end"] },
];

// The catalogue: 44 kinds x 6 colours x 4 versions = 1,056 entries.
export const FAMILIES = [
  ["Iron asteroid", 1, "rock"], ["Stony asteroid", 1, "rock"], ["Carbon asteroid", 1, "rock"], ["Rubble pile", 1, "rubble"], ["Contact binary", 1, "twin"],
  ["Trojan asteroid", 1, "rock"], ["Centaur", 1, "rock"], ["Kuiper object", 1, "rock"], ["Moonlet", 1, "rock"], ["Dust cloud", 1, "dust"],
  ["Long-period comet", 2, "comet"], ["Sungrazer", 2, "comet"], ["Interstellar comet", 2, "comet"], ["Main-belt comet", 2, "comet"], ["Fragmenting comet", 2, "comet"],
  ["Ice dwarf", 2, "dwarf"], ["Plutoid", 2, "dwarf"], ["Dwarf world with a moon", 2, "dwarf"],
  ["Ringed giant", 3, "ringed"], ["Ice giant", 3, "planet"], ["Lava world", 3, "lava"], ["Ocean world", 3, "planet"], ["Desert world", 3, "planet"], ["Super-Earth", 3, "planet"],
  ["Hot Jupiter", 3, "banded"], ["Rogue planet", 3, "rogue"], ["Tidally locked world", 3, "locked"], ["Diamond world", 3, "diamond"], ["Volcanic moon", 3, "moon"], ["Ice moon", 3, "moon"],
  ["Leonid shower", 4, "shower"], ["Perseid shower", 4, "shower"], ["Geminid shower", 4, "shower"], ["Draconid shower", 4, "shower"],
  ["Supernova", 5, "supernova"], ["Pulsar", 5, "pulsar"], ["Magnetar", 5, "pulsar"], ["Black hole", 5, "blackhole"], ["Binary black hole", 5, "blackhole"],
  ["Kilonova", 5, "supernova"], ["Quasar", 5, "quasar"], ["Nebula", 5, "nebula"], ["Wolf-Rayet star", 5, "star"], ["Red giant", 5, "star"],
].map(([name, tier, shape], id) => ({ id, name, tier, shape }));
export const COLOURS = [
  { id: "silver", name: "Silver", w: 0.3, c: ["#D8D3C8", "#5C5850"] },
  { id: "azure", name: "Azure", w: 0.2, c: ["#7FA6F5", "#173572"] },
  { id: "amber", name: "Amber", w: 0.2, c: ["#F2B45A", "#6B3B0B"] },
  { id: "emerald", name: "Emerald", w: 0.15, c: ["#6FD9A8", "#0F4A33"] },
  { id: "crimson", name: "Crimson", w: 0.1, c: ["#F06A5A", "#5E130C"] },
  { id: "violet", name: "Violet", w: 0.05, c: ["#B48CF2", "#2E1A5A"] },
];
export const VERSIONS = [
  { id: "", name: "", p: 1 - 1 / 12 - 1 / 40 - 1 / 200, mult: 1 },
  { id: "prismatic", name: "Prismatic", p: 1 / 12, mult: 1.5 },
  { id: "ancient", name: "Ancient", p: 1 / 40, mult: 2 },
  { id: "mythic", name: "Mythic", p: 1 / 200, mult: 4 },
];
export const TIER_P = { 1: 0.4, 2: 0.3, 3: 0.2, 4: 0.08, 5: 0.02 };
export const TIER_NAME = { 1: "Small bodies", 2: "Comets and dwarf worlds", 3: "Planets and moons", 4: "Meteor showers", 5: "Stellar events" };
const PTS = { 1: 10, 2: 30, 3: 80, 4: 40, 5: 250 };
export const CATALOGUE_SIZE = FAMILIES.length * COLOURS.length * VERSIONS.length;
export const famsIn = (t) => FAMILIES.filter((f) => f.tier === t);

// Each rare version gives a power-up; sets give them too.
export const POWERUPS = {
  prismatic: { name: "Refraction", text: "your next 3 actions each place 2 extra stars." },
  ancient: { name: "Old light", text: "for 10 minutes every action places double stars, and gold stars are 3 times as common." },
  mythic: { name: "Gravity well", text: "a star lands in every unfinished constellation, the core starts half full, every action places triple stars for 30 minutes, and your core can't cool for a week." },
};

// The reward ladder (spaced with the season simulation: a light member reaches ~6 rungs a season, a regular one the poster, only an engaged
// one the free month; the top title takes ~3 engaged seasons). Rewards with cash value come from effort, never chance. `claim`: the founder
// fulfils it by hand (they are listed in /admin once claimed).
export const LADDER = [
  { at: 80, reward: "First light: a profile badge", kind: "status" },
  { at: 200, reward: "A frame for your share cards", kind: "status" },
  { at: 400, reward: "Title: Astronomer", kind: "status" },
  { at: 650, reward: "Name your constellations (they show on your cards)", kind: "status" },
  { at: 1100, reward: "A week of the next plan up", kind: "value", claim: true },
  { at: 1900, reward: "Title: Cartographer + a Discord role", kind: "status", claim: true },
  { at: 3200, reward: "Your name on the founders' wall", kind: "lasting", claim: true },
  { at: 5500, reward: "Your season sky, printed and mailed as a poster", kind: "lasting", claim: true },
  { at: 12000, reward: "A free month", kind: "value", claim: true },
  { at: 20000, reward: "Name an object in everyone's catalogue", kind: "lasting", claim: true },
  { at: 40000, reward: "Title: Event Horizon, shown on everything you share", kind: "status" },
];
export const TITLES = [[0, "Spotter"], [400, "Astronomer"], [1900, "Cartographer"], [12000, "Astrophysicist"], [40000, "Event Horizon"]];
export const titleFor = (points) => [...TITLES].reverse().find(([t]) => points >= t)[1];

// Systems open gradually (twelve ideas at once is too many): constellations after the first find, the catalogue and sets after 10 finds.
export const UNLOCK = { constellations: 1, catalogue: 10 };
export const SET_COUNT = FAMILIES.length * 3 + 10;
export const DAY = 86400e3;

export function freshState() {
  return {
    v: 1,
    filled: Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, c.pts.map(() => null)])),
    mass: 0, points: 0, actions: 0, findsTotal: 0, lastActionAt: 0,
    daily: { day: "", done: [] },
    pending: [], found: {}, sets: {}, claimed: {},
    boosts: { extra: 0, doubleUntil: 0, goldUntil: 0, tripleUntil: 0, noCoolUntil: 0 },
    shower: 0, strains: 0, log: [],
    picks: {}, btm: [0, 0],
  };
}
export function normalize(s) {
  const base = freshState();
  const out = { ...base, ...(s && typeof s === "object" ? s : {}) };
  out.filled = { ...base.filled, ...(out.filled || {}) };
  out.boosts = { ...base.boosts, ...(out.boosts || {}) };
  out.daily = out.daily?.day != null ? out.daily : base.daily;
  return out;
}

const pickW = (list, rnd) => { let r = rnd(), a = 0; for (const x of list) { a += x.w ?? x.p; if (r < a) return x; } return list[list.length - 1]; };
export function findOf(famId, colourId, versionId) {
  const fam = FAMILIES[famId], colour = COLOURS.find((c) => c.id === colourId), version = VERSIONS.find((v) => v.id === versionId);
  const oneIn = Math.round(1 / ((TIER_P[fam.tier] / famsIn(fam.tier).length) * colour.w * version.p));
  const name = [version.name, colour.name, fam.name].filter(Boolean).join(" ");
  return { key: `${famId}|${colourId}|${versionId}`, fam: famId, colour: colourId, version: versionId, tier: fam.tier, name, oneIn, mult: version.mult };
}
function log(s, text, now) { s.log.unshift({ t: now, text }); s.log = s.log.slice(0, 40); }
const full = (s, id) => s.filled[id].every(Boolean);
function fill(s, id, color, rnd) {
  const f = s.filled[id];
  const empty = f.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return false;
  f[empty[Math.floor(rnd() * empty.length)]] = color;
  return true;
}
// one star: mostly the action's own colour, sometimes another, rarely gold (a wildcard that also lights The Singularity)
function placeStar(s, color, ctx, rnd) {
  let c = color;
  const r = rnd();
  const goldChance = (ctx.event === "aurora" ? 0.045 : 0.015) * (s.boosts.goldUntil > ctx.now ? 3 : 1);
  if (color === "gold") c = r < 0.25 ? "gold" : ["blue", "ember", "white"][Math.floor(rnd() * 3)];
  else if (r < goldChance) c = "gold";
  else if (r < goldChance + 0.17) c = ["blue", "ember", "white"].filter((x) => x !== color)[Math.floor(rnd() * 2)];
  if (c === "gold") {
    const target = CONSTELLATIONS.filter((k) => k.size !== "gold" && !full(s, k.id)).sort((a, b) => s.filled[a.id].filter((x) => !x).length - s.filled[b.id].filter((x) => !x).length)[0];
    if (target) fill(s, target.id, "gold", rnd);
    fill(s, "singularity", "gold", rnd);
    return "gold";
  }
  fill(s, CONSTELLATIONS.find((k) => k.color === c).id, c, rnd);
  return c;
}
export function litTier(s, event) {
  if (full(s, "singularity")) return 5;
  let t = 1;
  if (full(s, "huddle") || full(s, "blitz")) t = 2;
  if (full(s, "playbook")) t = 3;
  if (event === "eclipse") t = Math.min(3, t + 1);
  return t;
}
function spend(s, tier) {
  const id = tier === 5 ? "singularity" : tier === 3 && full(s, "playbook") ? "playbook" : tier >= 2 && tier <= 3 ? (full(s, "huddle") ? "huddle" : full(s, "blitz") ? "blitz" : null) : null;
  if (id) s.filled[id] = s.filled[id].map(() => null);
}
function applyPowerup(s, version, ctx, rnd) {
  const b = s.boosts, now = ctx.now;
  if (version === "prismatic") b.extra += 3;
  if (version === "ancient") { b.doubleUntil = Math.max(b.doubleUntil, now + 10 * 60e3); b.goldUntil = Math.max(b.goldUntil, now + 10 * 60e3); }
  if (version === "mythic") {
    for (const k of CONSTELLATIONS) if (!full(s, k.id)) fill(s, k.id, k.color, rnd);
    s.mass = Math.max(s.mass, 6);
    b.tripleUntil = Math.max(b.tripleUntil, now + 30 * 60e3);
    b.noCoolUntil = now + 7 * DAY;
  }
}
// Sets: Trio = 3 colours of a kind (44), Spectrum = all 6 (44), Quartet = 4 kinds in a tier (5), Survey = every kind in a tier (5),
// Legend = all 4 versions of a kind (44): 142 goals, each paying points and a power-up.
function checkSets(s, f, ctx, rnd) {
  const got = Object.values(s.found), fam = FAMILIES[f.fam], done = [];
  const mark = (key, label, power, pts) => { if (s.sets[key]) return; s.sets[key] = true; s.points += pts; applyPowerup(s, power, ctx, rnd); done.push({ label, power, pts }); };
  const cols = new Set(got.filter((e) => e.fam === f.fam).map((e) => e.colour)).size;
  const kinds = famsIn(fam.tier).filter((k) => got.some((e) => e.fam === k.id)).length;
  if (cols >= 3) mark(`trio:${f.fam}`, `Trio: 3 colours of ${fam.name}`, "prismatic", 40);
  if (cols === 6) mark(`spectrum:${f.fam}`, `Spectrum: every colour of ${fam.name}`, "ancient", 100);
  if (VERSIONS.every((v) => got.some((e) => e.fam === f.fam && e.version === v.id))) mark(`legend:${f.fam}`, `Legend: every version of ${fam.name}`, "mythic", 500);
  if (kinds >= 4) mark(`quartet:${fam.tier}`, `Quartet: 4 kinds of ${TIER_NAME[fam.tier].toLowerCase()}`, "prismatic", 60);
  if (kinds === famsIn(fam.tier).length) mark(`survey:${fam.tier}`, `Survey: every kind of ${TIER_NAME[fam.tier].toLowerCase()}`, fam.tier <= 2 ? "ancient" : "mythic", 250);
  return done;
}
export function setProgress(s) {
  const got = Object.values(s.found), out = [];
  for (const fam of FAMILIES) {
    const cols = new Set(got.filter((e) => e.fam === fam.id).map((e) => e.colour)).size;
    const vers = new Set(got.filter((e) => e.fam === fam.id).map((e) => e.version)).size;
    if (!s.sets[`trio:${fam.id}`] && cols) out.push({ label: `Trio · ${fam.name}`, have: cols, of: 3, power: "Refraction" });
    else if (!s.sets[`spectrum:${fam.id}`] && cols) out.push({ label: `Spectrum · ${fam.name}`, have: cols, of: 6, power: "Old light" });
    if (!s.sets[`legend:${fam.id}`] && vers > 1) out.push({ label: `Legend · ${fam.name}`, have: vers, of: 4, power: "Gravity well" });
  }
  for (const t of [1, 2, 3, 4, 5]) {
    const all = famsIn(t).length, have = famsIn(t).filter((k) => got.some((e) => e.fam === k.id)).length;
    if (!s.sets[`quartet:${t}`] && have && all > 4) out.push({ label: `Quartet · ${TIER_NAME[t]}`, have, of: 4, power: "Refraction" });
    else if (!s.sets[`survey:${t}`] && have) out.push({ label: `Survey · ${TIER_NAME[t]}`, have, of: all, power: t <= 2 ? "Old light" : "Gravity well" });
  }
  return out.sort((a, b) => a.of - a.have - (b.of - b.have) || b.have / b.of - a.have / a.of).slice(0, 5);
}

// The core collapses: the find is drawn (fairly, here, before anyone sees it), recorded, scored and queued for the telescope.
function collapse(s, ctx, rnd) {
  const lit = litTier(s, ctx.event);
  const r = rnd();
  const drawn = lit === 5 ? 5 : r < 0.4 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : r < 0.98 ? 4 : 5;
  let tier = drawn, miss = null;
  if ((drawn === 2 || drawn === 3) && drawn > lit) { tier = lit; miss = drawn; }
  if (drawn === 4) s.shower = Math.max(s.shower, ctx.now + 10 * 60e3);
  spend(s, tier);
  const fams = famsIn(tier);
  const f = findOf(fams[Math.floor(rnd() * fams.length)].id, pickW(COLOURS, rnd).id, pickW(VERSIONS, rnd).id);
  const had = s.found[f.key];
  s.found[f.key] = { n: (had?.n || 0) + 1, name: f.name, oneIn: f.oneIn, fam: f.fam, colour: f.colour, version: f.version, at: had?.at || ctx.now };
  s.findsTotal += 1;
  if (f.version) applyPowerup(s, f.version, ctx, rnd);
  const sets = checkSets(s, f, ctx, rnd);
  const pts = Math.round(PTS[tier] * f.mult) + (had ? 0 : 15);
  s.points += pts;
  s.mass = 0;
  const id = `SD-${String(new Date(ctx.now).getUTCFullYear()).slice(2)}-${Math.floor(rnd() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
  s.pending.push({ id, ...f, pts, first: !had, miss, shower: drawn === 4, sets, at: ctx.now });
  s.pending = s.pending.slice(-20);
  log(s, `Found: ${f.name} (1 in ${f.oneIn.toLocaleString()})`, ctx.now);
}

// One action. ctx = { now, day ("YYYY-MM-DD", Eastern), event: "tnf" | "eclipse" | "aurora" | null }. Returns what happened; `s` is changed in place.
export function award(s, action, ctx, rnd = Math.random) {
  const a = ACTIONS[action];
  if (!a) return { awarded: false };
  if (s.daily.day !== ctx.day) s.daily = { day: ctx.day, done: [] };
  if (s.daily.done.includes(action)) return { awarded: false };
  s.daily.done.push(action);
  const now = ctx.now, b = s.boosts;
  // the core cools when it's left alone for three days (unless a Gravity well holds it)
  if (s.lastActionAt && now - s.lastActionAt >= 3 * DAY && b.noCoolUntil < now && s.mass > 0) {
    const lost = Math.ceil(s.mass / 2);
    s.mass -= lost;
    log(s, `The core cooled while you were away (-${lost})`, now);
  }
  s.lastActionAt = now;
  s.actions += 1;
  let n = b.tripleUntil > now ? 3 : s.shower > now || ctx.event === "tnf" || b.doubleUntil > now ? 2 : 1;
  if (b.extra > 0) { n += 2; b.extra -= 1; }
  for (let i = 0; i < n; i++) placeStar(s, a.color, ctx, rnd);
  s.mass += n;
  log(s, `${a.label}: ${n} star${n === 1 ? "" : "s"}`, now);
  // a find about every 3 actions; a new member's first find comes by their second action
  const p = !s.findsTotal && s.actions >= 2 ? 1 : Math.min(0.7, 0.12 + 0.06 * s.mass);
  const r = rnd();
  if (r < p) { collapse(s, ctx, rnd); return { awarded: true, stars: n, collapsed: true }; }
  if (r < p + 0.14) { s.strains += 1; log(s, "The core strained … and held.", now); return { awarded: true, stars: n, strained: true }; }
  return { awarded: true, stars: n };
}

// ---- Beat the Model ----
// This week's three head-to-heads: neighbours in the weekly rankings at one position (RB, WR, TE), from the top 36 at it, picked the same way
// for everyone (seeded by the week). rows: [{ player_name, position, projection, rank }].
export function pickPairs(rows, season, week) {
  let seed = season * 100 + week;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (const pos of ["RB", "WR", "TE"]) {
    const pool = rows.filter((r) => r.position === pos && r.projection > 0).sort((a, b) => b.projection - a.projection).slice(0, 36);
    if (pool.length < 2) continue;
    const i = Math.floor(rnd() * (pool.length - 1));
    const [a, b] = rnd() < 0.5 ? [pool[i], pool[i + 1]] : [pool[i + 1], pool[i]];
    out.push({ a: a.player_name, b: b.player_name, pos, model: a.projection >= b.projection ? 0 : 1, gap: Math.round(Math.abs(a.projection - b.projection) * 10) / 10 });
  }
  return out;
}
// Grade a finished week: right picks light a star each (a gold star a quarter of the time) and earn 20 orbit points. points: name -> points.
export function gradePicks(s, key, points, ctx, rnd = Math.random) {
  const wk = s.picks[key];
  if (!wk || wk.graded) return 0;
  let right = 0, made = 0;
  wk.pairs.forEach((p, i) => {
    const c = wk.choice[i];
    if (c == null) return;
    const pa = points[p.a], pb = points[p.b];
    if (pa == null || pb == null || pa === pb) return; // a player without a game, or a tie: no decision
    made++;
    if ((c === 0 ? pa > pb : pb > pa)) { right++; placeStar(s, "gold", ctx, rnd); s.points += 20; }
  });
  wk.graded = true;
  wk.right = right;
  wk.made = made;
  s.btm = [s.btm[0] + right, s.btm[1] + made - right];
  if (made) log(s, `Beat the Model: ${right} of ${made} right`, ctx.now);
  return right;
}

// The NFL calendar's events. week: Sleeper's display week; date: the Eastern date.
export function eventFor(date, week) {
  const m = date.getUTCMonth(), d = date.getUTCDate(), dow = date.getUTCDay();
  if (m === 3 && d >= 22 && d <= 30) return "aurora"; // draft week (late April)
  if (week >= 15 && week <= 17) return "eclipse"; // the fantasy playoffs
  if (dow === 4 && week >= 1 && week <= 18) return "tnf"; // Thursday Night Football
  return null;
}
export const EVENT_TEXT = {
  tnf: "Thursday Night meteor shower: every action places two stars today.",
  eclipse: "Playoff eclipse: every find is powered one step up during the fantasy playoffs.",
  aurora: "Draft-week aurora: gold stars are three times as common.",
};

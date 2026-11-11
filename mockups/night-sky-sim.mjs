// Run: node mockups/night-sky-sim.mjs -- a season (18 weeks) of the Night Sky for light / regular / engaged members, 2,000 each. Keep its numbers in step with mockups/night-sky.html.
// Season simulation of the Night Sky mockup's rules (mockups/night-sky.html), one member at a time.
const FAM = [10, 8, 12, 4, 10]; // kinds per tier 1..5
const TIER_P = [0.4, 0.3, 0.2, 0.08, 0.02];
const COL_W = [0.3, 0.2, 0.2, 0.15, 0.1, 0.05];
const VER_P = [1 - 1 / 12 - 1 / 40 - 1 / 200, 1 / 12, 1 / 40, 1 / 200];
const PTS = [10, 30, 80, 40, 250], MULT = [1, 1.5, 2, 4];
const CONST = { huddle: ["blue", 4], blitz: ["ember", 4], playbook: ["white", 5], singularity: ["gold", 10] };
const LADDER = [80, 200, 400, 650, 1100, 1900, 3200, 5500, 12000, 20000, 40000];
const pickW = (w) => { let r = Math.random(), a = 0; for (let i = 0; i < w.length; i++) { a += w[i]; if (r < a) return i; } return w.length - 1; };

function season(actionsPerDay, weeks = 18) {
  const filled = Object.fromEntries(Object.entries(CONST).map(([k, [, n]]) => [k, 0]));
  const found = new Map(); // key -> 1
  const famCols = {}, famVers = {}, tierKinds = [new Set(), new Set(), new Set(), new Set(), new Set()];
  const sets = new Set();
  let mass = 0, points = 0, lastActDay = 0;
  const out = { actions: 0, collapses: 0, strains: 0, edgeMiss: 0, finds: [0, 0, 0, 0, 0], vers: [0, 0, 0, 0], constDone: 0, powerups: 0, sets: 0, first: {}, stars: 0, oneAwayMoments: 0 };
  let extra = 0, sessionBoost = 1; // Refraction counter; time boosts last the rest of the session
  const full = (k) => filled[k] >= CONST[k][1];
  const fill = (k) => { if (filled[k] < CONST[k][1]) { filled[k]++; if (full(k)) out.constDone++; return true; } return false; };
  const place = (color) => {
    out.stars++;
    let c = color; const r = Math.random();
    if (color === "gold") c = r < 0.25 ? "gold" : ["blue", "ember", "white"][Math.floor(Math.random() * 3)];
    else if (r < 0.015) c = "gold"; else if (r < 0.185) c = ["blue", "ember", "white"].filter((x) => x !== color)[Math.floor(Math.random() * 2)];
    if (c === "gold") { const t = ["huddle", "blitz", "playbook"].filter((k) => !full(k)).sort((a, b) => (CONST[a][1] - filled[a]) - (CONST[b][1] - filled[b]))[0]; if (t) fill(t); fill("singularity"); return; }
    fill(Object.keys(CONST).find((k) => CONST[k][0] === c));
  };
  const lit = () => full("singularity") ? 5 : full("playbook") ? 3 : full("huddle") || full("blitz") ? 2 : 1;
  const spend = (t) => { const k = t === 5 ? "singularity" : t === 3 && full("playbook") ? "playbook" : t >= 2 ? (full("huddle") ? "huddle" : full("blitz") ? "blitz" : null) : null; if (k) filled[k] = 0; };
  const power = (v, day) => { out.powerups++; if (v === 1) extra += 3; if (v === 2) sessionBoost = Math.max(sessionBoost, 2); if (v === 3) { for (const k of Object.keys(CONST)) if (!full(k)) fill(k); mass = Math.max(mass, 6); sessionBoost = 3; } };
  const markFirst = (k, day) => { if (out.first[k] == null) out.first[k] = day / 7; };
  const reveal = (day) => {
    out.collapses++;
    const L = lit(); const r = Math.random();
    let drawn = L === 5 ? 5 : r < 0.4 ? 1 : r < 0.7 ? 2 : r < 0.9 ? 3 : r < 0.98 ? 4 : 5, tier = drawn;
    if ((drawn === 2 || drawn === 3) && drawn > L) { tier = L; out.edgeMiss++; }
    spend(tier === 4 ? 1 : tier);
    const fam = Math.floor(Math.random() * FAM[tier - 1]), col = pickW(COL_W), ver = pickW(VER_P);
    out.finds[tier - 1]++; out.vers[ver]++;
    markFirst("tier" + tier, day); if (ver) markFirst("ver" + ver, day);
    const key = `${tier}.${fam}.${col}.${ver}`; const first = !found.has(key); found.set(key, 1);
    points += PTS[tier - 1] * MULT[ver] + (first ? 15 : 0);
    const fk = `${tier}.${fam}`;
    (famCols[fk] ||= new Set()).add(col); (famVers[fk] ||= new Set()).add(ver); tierKinds[tier - 1].add(fam);
    if (ver) power(ver, day);
    const set = (k, pts, v) => { if (!sets.has(k)) { sets.add(k); out.sets++; points += pts; if (v) power(v, day); } };
    if (famCols[fk].size >= 3) set("trio" + fk, 40, 1);
    if (famCols[fk].size === 6) set("s" + fk, 100, 2);
    if (famVers[fk].size === 4) set("l" + fk, 500, 3);
    if (tierKinds[tier - 1].size >= 4) set("q" + tier, 60, 1);
    if (tierKinds[tier - 1].size === FAM[tier - 1]) set("t" + tier, 250, tier <= 2 ? 2 : 3);
    mass = 0;
  };
  const colors = ["blue", "blue", "ember", "ember", "white", "white"];
  for (let day = 1; day <= weeks * 7; day++) {
    // actions today: Poisson-ish around the profile's rate, capped at 6 (each action counts once a day)
    let n = 0; for (let k = 0; k < 6; k++) if (Math.random() < actionsPerDay / 6) n++;
    if (n && day - lastActDay >= 3) mass -= Math.ceil(mass / 2); // the core cooled
    sessionBoost = 1;
    const todays = colors.slice().sort(() => Math.random() - 0.5).slice(0, n);
    for (const c of todays) {
      out.actions++; lastActDay = day;
      let s = sessionBoost; if (extra > 0) { s += 2; extra--; }
      for (let i = 0; i < s; i++) place(c);
      mass += s;
      const p = out.collapses === 0 && out.actions >= 2 ? 1 : Math.min(0.7, 0.12 + 0.06 * mass), r = Math.random();
      if (r < p) reveal(day); else if (r < p + 0.14) out.strains++;
    }
    if (day % 7 === 1) { for (let k = 0; k < 3; k++) if (Math.random() < 0.55) { place("gold"); points += 20; } } // Monday: Beat the Model, 3 picks
    // a constellation one star from done right now = a visible near miss
    if (Object.keys(CONST).some((k) => filled[k] === CONST[k][1] - 1)) out.oneAwayMoments++;
  }
  out.points = points; out.catalogue = found.size; out.milestones = LADDER.filter((t) => points >= t).length;
  return out;
}

const profiles = { "Light (about 1 action a day)": 1, "Regular (about 3 a day)": 3, "Engaged (all 6 a day)": 6 };
const N = 2000;
for (const [label, rate] of Object.entries(profiles)) {
  const runs = Array.from({ length: N }, () => season(rate));
  const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / N;
  const pct = (f) => (100 * runs.filter(f).length) / N;
  const med = (f) => { const v = runs.map(f).filter((x) => x != null).sort((a, b) => a - b); return v.length < N / 2 ? null : v[Math.floor(N / 2)]; };
  const weeks = 18;
  const tierShare = [0, 1, 2, 3, 4].map((t) => avg((r) => r.finds[t]) / avg((r) => r.collapses) * 100);
  console.log(`\n=== ${label} ===`);
  console.log(`actions a week ${avg((r) => r.actions) / weeks | 0}, stars a week ${(avg((r) => r.stars) / weeks).toFixed(1)}`);
  console.log(`actions per find ${(avg((r) => r.actions) / avg((r) => r.collapses)).toFixed(2)}, finds a week ${(avg((r) => r.collapses) / weeks).toFixed(1)}`);
  console.log(`near misses a week: core strained ${(avg((r) => r.strains) / weeks).toFixed(1)}, bigger find at the edge ${(avg((r) => r.edgeMiss) / weeks).toFixed(1)}, days with a constellation one star away ${(avg((r) => r.oneAwayMoments) / weeks).toFixed(1)} of 7`);
  console.log(`finds by tier %: small ${tierShare[0].toFixed(0)} comet ${tierShare[1].toFixed(0)} planet ${tierShare[2].toFixed(0)} shower ${tierShare[3].toFixed(0)} stellar ${tierShare[4].toFixed(1)}`);
  console.log(`constellations finished a week ${(avg((r) => r.constDone) / weeks).toFixed(1)}, power-ups a week ${(avg((r) => r.powerups) / weeks).toFixed(2)}`);
  console.log(`weeks to first: comet ${med((r) => r.first.tier2)?.toFixed(1)}, planet ${med((r) => r.first.tier3)?.toFixed(1)}, stellar ${med((r) => r.first.tier5)?.toFixed(1) ?? "most never"}, prismatic ${med((r) => r.first.ver1)?.toFixed(1)}, ancient ${med((r) => r.first.ver2)?.toFixed(1) ?? "most never"}, mythic ${med((r) => r.first.ver3)?.toFixed(1) ?? "most never"}`);
  console.log(`season: catalogue ${avg((r) => r.catalogue).toFixed(0)} of 1056, sets ${avg((r) => r.sets).toFixed(1)} of 142, orbit points ${avg((r) => r.points).toFixed(0)}, milestones ${avg((r) => r.milestones).toFixed(1)} of 11`);
  console.log(`members who ever see: a stellar event ${pct((r) => r.finds[4] > 0).toFixed(0)}%, an ancient ${pct((r) => r.vers[2] > 0).toFixed(0)}%, a mythic ${pct((r) => r.vers[3] > 0).toFixed(0)}%, reach the poster (5,500) ${pct((r) => r.points >= 5500).toFixed(0)}%, the free month (12,000) ${pct((r) => r.points >= 12000).toFixed(0)}%, the Event Horizon title (40,000) ${pct((r) => r.points >= 40000).toFixed(1)}%, median points ${(() => { const v = runs.map((r) => r.points).sort((a, b) => a - b); return v[N >> 1]; })()}`);
}

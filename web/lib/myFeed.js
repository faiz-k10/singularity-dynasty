// "Your players this week": what moved for the players on the viewer's saved teams between the
// two most recent published weeks. Pure -- the data loading is in myFeedData.js, the tests in
// test/myFeed.test.mjs. Every threshold is here so "what counts as a change" lives in one place.
import { normalizePlayerName } from "./portfolio.js";
import { isBye } from "./bye.js";

export const FEED_RULES = {
  medianPct: 0.05, // season median must move by this share of last week's...
  medianMin: 4, //    ...and by at least this many points
  bandPct: 0.08, //   floor / ceiling: same idea, a little looser (they are noisier)
  bandMin: 8,
  rankMove: 5, //     weekly rank must move this many spots...
  rankDepth: 80, //   ...and at least one of the two ranks must be inside the top this many (a move from 266 to 273 means nothing)
  // Floor/ceiling published before this week used the older (non-banked) method, so a jump
  // between that week and a later one is the method, not the player. Compare bands only when
  // the earlier week is this one or later.
  bandsFromWeek: 5,
};

const norm = (rows) => {
  const m = new Map();
  for (const r of rows || []) m.set(normalizePlayerName(r.player_name), r);
  return m;
};

// position rank (1 = best median at his position) per normalized name
function positionRanks(rows) {
  const byPos = {};
  for (const r of rows || []) (byPos[r.position] ||= []).push(r);
  const out = new Map();
  for (const list of Object.values(byPos)) {
    list.sort((a, b) => b.median - a.median);
    list.forEach((r, i) => out.set(normalizePlayerName(r.player_name), i + 1));
  }
  return out;
}

const sign = (n) => (n > 0 ? "+" : "−");
const pts = (n) => Math.round(Math.abs(n));

// sims/ranks/roles/groups: { cur: rows[], prev: rows[] } -- any of them may be missing.
// sims rows: { player_name, position, median, floor, ceiling }; ranks rows: { player_name, rank, week, opponent, is_home };
// roles rows: { player_name, archetype }; groups rows: { player_name, kind, label }.
export function buildFeed({ mine, sims, ranks, roles, groups, teamIndex = null, simPrevWeek = null }) {
  const bandsComparable = simPrevWeek == null || simPrevWeek >= FEED_RULES.bandsFromWeek;
  const simCur = norm(sims?.cur);
  const simPrev = norm(sims?.prev);
  const rankCur = norm(ranks?.cur);
  const rankPrev = norm(ranks?.prev);
  const roleCur = norm(roles?.cur);
  const rolePrev = norm(roles?.prev);
  const grp = (rows, kind) => norm((rows || []).filter((r) => r.kind === kind));
  const susCur = grp(groups?.cur, "sustainability");
  const susPrev = grp(groups?.prev, "sustainability");
  const stageCur = grp(groups?.cur, "career_stage");
  const stagePrev = grp(groups?.prev, "career_stage");
  const prCur = positionRanks(sims?.cur);
  const prPrev = positionRanks(sims?.prev);

  const items = [];
  for (const [key, hits0] of Object.entries(mine?.byName || {})) {
    const hits = teamIndex == null ? hits0 : hits0.filter((h) => h[0] === teamIndex);
    if (!hits.length) continue;
    const lines = [];
    const sc = simCur.get(key);
    const sp = simPrev.get(key);
    if (sc && sp) {
      const d = sc.median - sp.median;
      if (Math.abs(d) >= Math.max(FEED_RULES.medianMin, FEED_RULES.medianPct * sp.median)) {
        const rc = prCur.get(key);
        const rp = prPrev.get(key);
        const rankBit = rc && rp && rc !== rp ? ` · ${sc.position}${rp} → ${sc.position}${rc}` : "";
        lines.push({
          kind: "median",
          dir: d > 0 ? "up" : "down",
          text: `Season median ${sign(d)}${pts(d)} pts (${Math.round(sp.median)} → ${Math.round(sc.median)})${rankBit}`,
          score: 3 + Math.min((Math.abs(d) / sp.median) * 10, 3),
        });
      }
      for (const [col, label] of bandsComparable ? [["ceiling", "Ceiling"], ["floor", "Floor"]] : []) {
        const b = sc[col] - sp[col];
        if (Math.abs(b) >= Math.max(FEED_RULES.bandMin, FEED_RULES.bandPct * sp[col])) {
          lines.push({ kind: col, dir: b > 0 ? "up" : "down", text: `${label} ${sign(b)}${pts(b)} pts`, score: 1.5 });
        }
      }
    }
    const rc = rankCur.get(key);
    const rp = rankPrev.get(key);
    if (rc && rp) {
      const moved = rp.rank - rc.rank; // positive = climbed
      const note = (rc.notes || "").trim();
      const prevNote = (rp.notes || "").trim();
      if (note && note !== prevNote) {
        // Listed out/doubtful etc.: the rank he lands on is a placeholder, so say the status instead.
        lines.push({ kind: "status", dir: "down", text: `Listed ${note.length <= 14 ? note.toUpperCase() : note} for week ${rc.week}`, score: 8 });
      } else if (prevNote && !note) {
        lines.push({ kind: "status", dir: "up", text: `Back in the week ${rc.week} rankings (#${rc.rank}) after being listed ${prevNote.length <= 14 ? prevNote.toUpperCase() : prevNote}`, score: 7 });
      } else if (!note && Math.abs(moved) >= FEED_RULES.rankMove && Math.min(rp.rank, rc.rank) <= FEED_RULES.rankDepth) {
        const opp = rc.opponent ? (isBye(rc.opponent) ? " · bye week" : ` · ${rc.is_home === false ? "@" : "vs"} ${rc.opponent}`) : "";
        lines.push({
          kind: "rank",
          dir: moved > 0 ? "up" : "down",
          text: `Week ${rc.week} rank ${rp.rank} → ${rc.rank}${opp}`,
          score: 2.5 + Math.min(Math.abs(moved) / 10, 2),
        });
      }
    }
    const a = roleCur.get(key);
    const ap = rolePrev.get(key);
    if (a && ap && a.archetype !== ap.archetype) {
      lines.push({ kind: "role", dir: "flag", text: `Role changed: ${ap.archetype} → ${a.archetype}`, score: 3 });
    }
    const s = susCur.get(key);
    const sp2 = susPrev.get(key);
    if (s && sp2 && s.label !== sp2.label) {
      lines.push({ kind: "sus", dir: "flag", text: `Sustainability: ${sp2.label} → ${s.label}`, score: 2 });
    }
    const g = stageCur.get(key);
    const gp = stagePrev.get(key);
    if (g && gp && g.label !== gp.label) {
      lines.push({ kind: "stage", dir: "flag", text: `Career stage: ${gp.label} → ${g.label}`, score: 1.5 });
    }
    if (!lines.length) continue;
    lines.sort((x, y) => y.score - x.score);
    const starter = hits.some((h) => h[1]);
    items.push({
      name: (sc || rankCur.get(key) || roleCur.get(key) || {}).player_name || key,
      position: (sc || rankCur.get(key) || roleCur.get(key) || {}).position || null,
      starter,
      teams: hits.map(([i, st]) => ({ i, label: mine.teams[i], starter: !!st })),
      lines,
      score: lines[0].score + (lines.length > 1 ? 0.3 : 0),
    });
  }
  items.sort((a, b) => Number(b.starter) - Number(a.starter) || b.score - a.score);
  const starters = items.filter((i) => i.starter).length;
  return { items, starters, bench: items.length - starters };
}

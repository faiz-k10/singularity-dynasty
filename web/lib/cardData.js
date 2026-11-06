import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { findBio } from "@/lib/portfolio";
import { getPlayerBiosByNamePos } from "@/lib/sleeper";
import { indexLeans, flagFor } from "@/lib/defenseLeans";
import { isBye } from "@/lib/bye";
import { weekReceipts } from "@/lib/receipts";
import { smashSpots } from "@/lib/smashSpots";
import { readCardToken } from "@/lib/cardToken";
import { pickStart } from "@/lib/startSit";
import { rowsFromData, scoreRows, boardRows, buildBoard, FORMATS, MODES, GROUP_NAMES } from "@/lib/dynastyBoard";
import { getDynastyRows } from "@/lib/dynastyData";
import dynastyData from "@/data/dynasty-values.json";
import { getAchievements } from "@/app/tools/achievements";
import { getCachedRedraftData, getCachedLeans, getCachedTdProfile, getCachedUsageProfile, enrichRankings } from "@/app/tools/redraft-rankings/data";

// Server-only: the numbers behind the share cards (app/c, app/receipts, app/smash). Every card reads the SAME published rows as the tool it comes
// from -- the latest week through the Weekly Projection Rankings loaders (so the badges match), earlier weeks straight from the tables.

// The key that signs card links (lib/cardToken.js). CARD_SECRET if set, else derived from the service-role key, which is already a server-only secret.
export function cardSecret() {
  const base = process.env.CARD_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base ? createHash("sha256").update(`sd-share-card:${base}`).digest() : null;
}

// ---- weeks -------------------------------------------------------------------------------------------------------------------------------

const weekRows = unstable_cache(
  async (season, week) =>
    fetchAllRows(createPublicClient(), "redraft_rankings", "rank, player_name, position, team, opponent, is_home, projection, floor, ceiling", (q) =>
      q.eq("season", season).eq("week", week).order("rank", { ascending: true }).order("player_name")
    ),
  ["card-week-rows-v2"],
  { revalidate: 600 }
);

// The leans that were SHOWN with a week's rankings: the newest ones published through an earlier week (week 8's rankings carry the leans
// that run through week 7's games).
const leansShownWith = unstable_cache(
  async (season, week) => {
    const pub = createPublicClient();
    const { data: wk } = await pub.from("defense_leans").select("week").eq("season", season).lt("week", week).order("week", { ascending: false }).limit(1).maybeSingle();
    if (!wk) return [];
    const { data } = await pub.from("defense_leans").select("defense, position, call, score, effect, rank_now, rank_prior").eq("season", season).eq("week", wk.week);
    return data || [];
  },
  ["card-leans-shown-v1"],
  { revalidate: 600 }
);

// The latest published week, enriched once per cached bundle exactly as Weekly Projection Rankings does it (full pool, so ranks and badges match).
const enrichedFor = new WeakMap();
async function latestEnriched() {
  const [cached, bioByNamePos, leanRows, tdProfile, usageProfile] = await Promise.all([getCachedRedraftData(), getPlayerBiosByNamePos(), getCachedLeans(), getCachedTdProfile(), getCachedUsageProfile()]);
  if (!cached.latest) return { latest: null, rows: [] };
  let rows = enrichedFor.get(cached);
  if (!rows) {
    rows = enrichRankings({ cached, hasFullAccess: true, tdProfile, usageProfile, leanRows, bioByNamePos });
    enrichedFor.set(cached, rows);
  }
  return { latest: cached.latest, rows, bioByNamePos };
}

export async function latestWeek() {
  return (await getCachedRedraftData()).latest;
}

const posLabels = (rows) => {
  const n = {};
  const out = new Map();
  for (const r of rows) {
    n[r.position] = (n[r.position] || 0) + 1;
    out.set(r.player_name, `${r.position}${n[r.position]}`);
  }
  return out;
};

function cardPlayer(r, extra = {}) {
  const bye = isBye(r.opponent);
  return {
    name: r.player_name,
    pos: r.position,
    team: r.team,
    opponent: bye ? null : r.opponent,
    isHome: r.is_home,
    bye,
    out: !bye && !(r.projection > 0),
    projection: r.projection,
    floor: r.floor,
    ceiling: r.ceiling,
    rank: r.rank,
    posLabel: r.positionLabel || null,
    ...extra,
  };
}

// One player's week for a card: { season, week, player } or null. `player` carries his badges when it is the latest week.
export async function weeklyCardPlayer(season, week, name, pos) {
  const latest = await latestEnriched();
  if (latest.latest?.season === season && latest.latest?.week === week) {
    const r = latest.rows.find((x) => x.player_name === name && x.position === pos);
    if (!r) return null;
    return {
      season,
      week,
      player: cardPlayer(r, {
        badges: getAchievements(r).map((b) => ({ variant: b.variant, label: b.label })),
        lean: r.defLean ? { call: r.defLean.call, effect: r.defLean.effect } : null,
        headshot: r.bio?.headshot || null,
        played: r.playedThisWeek,
      }),
    };
  }
  // An earlier week: the row as published (no badges -- they are worked out from the games before that week, which we don't rebuild).
  const [rows, leanRows, bios] = await Promise.all([weekRows(season, week), leansShownWith(season, week), getPlayerBiosByNamePos()]);
  const labels = posLabels(rows);
  const r = rows.find((x) => x.player_name === name && x.position === pos);
  if (!r) return null;
  const flag = flagFor(indexLeans(leanRows), r.opponent, r.position);
  return {
    season,
    week,
    player: cardPlayer(
      { ...r, positionLabel: labels.get(r.player_name) },
      { badges: [], lean: flag ? { call: flag.call, effect: flag.effect } : null, headshot: findBio(bios, name, pos)?.headshot || null, played: null }
    ),
  };
}

// Who a viewer may make a card for this week: everyone ranked for Explorer / Singularity, the top 50 otherwise (Weekly Projection Rankings' rule).
export async function canCardPlayer(name, pos, hasFullAccess) {
  const cached = await getCachedRedraftData();
  const rows = hasFullAccess ? cached.rows : cached.rows.slice(0, 50);
  return Boolean(cached.latest && rows.some((r) => r.player_name === name && r.position === pos));
}

// ---- dynasty --------------------------------------------------------------------------------------------------------------------------------

// One player's dynasty card in a format and mode: his score, range, ranks and tier exactly as the Rankings tab of the Dynasty Draft Board draws them.
export function dynastyCardPlayer(id, format, mode) {
  const all = rowsFromData(dynastyData);
  const scored = scoreRows(all, format, mode);
  const i = scored.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const p = scored[i];
  const L = boardRows(all, { format, mode, pos: "ALL" });
  const { tiers } = buildBoard(L);
  const at = L.findIndex((r) => r.id === id);
  const tier = at < 0 ? null : tiers.find((t) => at >= t.a && at <= t.b);
  const m = MODES[mode];
  return {
    built: dynastyData.built,
    format: FORMATS[format].label,
    mode: m.label,
    weights: { prod: m.prod, age: m.age },
    player: {
      id: p.id, name: p.name, pos: p.pos, team: p.team, age: p.age, ppg: p.ppg, games: p.games,
      score: p.score, lo: p.lo, hi: p.hi, prod: p.prod, ageValue: p.ageValue,
      rank: i + 1,
      posRank: scored.filter((r) => r.pos === p.pos).findIndex((r) => r.id === id) + 1,
      tier: tier ? { n: tier.ti + 1, of: tiers.length, group: GROUP_NAMES[tier.g] || null } : null,
    },
  };
}

export function canCardDynasty(id, hasFullAccess) {
  return getDynastyRows(hasFullAccess).rows.some((r) => r.id === id);
}

// ---- receipts and smash spots ----------------------------------------------------------------------------------------------------------------

// The newest week that has both published rankings and finished games, as { season, week } (null before the first one).
export const latestReceiptsWeek = unstable_cache(
  async () => {
    const pub = createPublicClient();
    const latest = await latestWeek();
    if (!latest) return null;
    // the in-progress week is never "finished": only weeks before the latest published one
    const { data } = await pub.from("player_game_log").select("season, week").eq("season", latest.season).lt("week", latest.week).order("week", { ascending: false }).limit(1).maybeSingle();
    return data ? { season: data.season, week: data.week } : null;
  },
  ["card-receipts-latest-v1"],
  { revalidate: 600 }
);

export const receiptsFor = unstable_cache(
  async (season, week) => {
    const latest = await latestWeek();
    if (!latest || season !== latest.season || week >= latest.week) return null; // only finished weeks
    const [rankRows, leanRows, games] = await Promise.all([
      weekRows(season, week),
      leansShownWith(season, week),
      fetchAllRows(createPublicClient(), "player_game_log", "player_name, position, fantasy_points_ppr", (q) => q.eq("season", season).eq("week", week).order("player_name").order("position")),
    ]);
    if (!rankRows.length || !games.length) return null;
    return { season, week, ...weekReceipts({ rankRows, games, leanRows }) };
  },
  ["card-receipts-v1"],
  { revalidate: 3600 }
);

export async function smashFor(season, week) {
  const latest = await latestWeek();
  if (!latest || season !== latest.season || week > latest.week) return null;
  const isLatest = week === latest.week;
  const [rankRows, leanRows] = isLatest ? [(await getCachedRedraftData()).rows, await getCachedLeans()] : await Promise.all([weekRows(season, week), leansShownWith(season, week)]);
  if (!rankRows.length) return null;
  return { season, week, ...smashSpots({ rankRows, leanRows }) };
}

// "2026-w8" <-> { season, week }
export const weekSlug = ({ season, week }) => `${season}-w${week}`;
export function parseWeekSlug(slug) {
  const m = /^(\d{4})-w(\d{1,2})$/.exec(String(slug || ""));
  return m ? { season: Number(m[1]), week: Number(m[2]) } : null;
}

// ---- a card link -> what it shows -----------------------------------------------------------------------------------------------------------

const one = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");
const range = (p) => (p.bye ? "on a bye" : p.out ? "listed out" : `${one(p.projection)} median, ${one(p.floor)} to ${one(p.ceiling)} range`);
const spot = (lean) => (lean ? ` · ${lean.call === "SMASH" ? "Smash" : "Tough"} Spot ${lean.effect > 0 ? "+" : "−"}${Math.abs(lean.effect).toFixed(1)}` : "");

// The card a signed token stands for, with its words: { card, data, title, description, caption, tool: { href, label } } or null.
export async function cardFromToken(token) {
  const card = readCardToken(token, cardSecret());
  if (!card) return null;
  if (card.k === "p") {
    const data = await weeklyCardPlayer(card.s, card.w, card.n, card.pos);
    if (!data) return null;
    const p = data.player;
    return {
      card,
      data,
      title: `${p.name}, week ${card.w}: ${range(p)}`,
      description: `${[p.posLabel, p.rank != null && `#${p.rank} overall`, p.opponent && `${p.isHome ? "vs" : "@"} ${p.opponent}`].filter(Boolean).join(" · ")}${spot(p.lean)}. From Singularity Dynasty's Weekly Projection Rankings.`,
      caption: `${p.name}, week ${card.w}: ${range(p)}.`,
      tool: { href: "/tools/redraft-rankings", label: "See every player's range" },
    };
  }
  if (card.k === "d") {
    const data = dynastyCardPlayer(card.id, card.f, card.m);
    if (!data) return null;
    const p = data.player;
    return {
      card,
      data,
      title: `${p.name} in dynasty: ${p.score.toFixed(1)}, #${p.rank} overall (${data.format}, ${data.mode})`,
      description: `${p.pos}${p.posRank}${p.tier ? ` · Tier ${p.tier.n} of ${p.tier.of}` : ""} · ${p.age.toFixed(1)} years old · ${one(p.ppg)} PPR points a game. From Singularity Dynasty's Dynasty Draft Board.`,
      caption: `${p.name} in dynasty: ${p.score.toFixed(1)}, ${p.pos}${p.posRank} and #${p.rank} overall (${data.format}, ${data.mode}).`,
      tool: { href: "/tools/draft-board", label: "See the whole dynasty board" },
    };
  }
  const [a, b] = await Promise.all([weeklyCardPlayer(card.s, card.w, card.a[0], card.a[1]), weeklyCardPlayer(card.s, card.w, card.b[0], card.b[1])]);
  if (!a || !b) return null;
  const usable = (p) => !p.bye && !p.out;
  const choice = usable(a.player) && usable(b.player)
    ? pickStart({ projection: a.player.projection, effect: a.player.lean?.effect }, { projection: b.player.projection, effect: b.player.lean?.effect })
    : { pick: usable(a.player) ? "a" : usable(b.player) ? "b" : null, gain: Math.abs((a.player.projection || 0) - (b.player.projection || 0)) };
  const neither = !usable(a.player) && !usable(b.player); // both on a bye or listed out: no pick, and not a "coin flip" either
  const data = { season: card.s, week: card.w, a: a.player, b: b.player, ...choice, neither };
  const winner = choice.pick === "a" ? a.player : choice.pick === "b" ? b.player : null;
  const loser = choice.pick === "a" ? b.player : a.player;
  const projWord = (p) => (p.bye ? "bye" : p.out ? "out" : one(p.projection));
  return {
    card,
    data,
    title: winner ? `Start ${winner.name} over ${loser.name} (week ${card.w})` : neither ? `${a.player.name} or ${b.player.name}? Neither plays in week ${card.w}` : `${a.player.name} or ${b.player.name}? A coin flip in week ${card.w}`,
    description: `${a.player.name} ${projWord(a.player)} vs ${b.player.name} ${projWord(b.player)}, median plus the Smash / Tough Spot effect. From Singularity Dynasty.`,
    caption: `Start / sit, week ${card.w}: ${a.player.name} (${projWord(a.player)}) or ${b.player.name} (${projWord(b.player)})? ${winner ? `The pick: ${winner.name}.` : neither ? "Neither plays this week." : "Too close to call."}`,
    tool: { href: `/tools/compare-players?p1=${encodeURIComponent(a.player.name)}&p2=${encodeURIComponent(b.player.name)}`, label: "Compare them side by side" },
  };
}

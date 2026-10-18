import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { FLAG_MIN_SCORE } from "@/lib/defenseLeans";

// Data for the landing page's hub, fetched once and cached for 5 minutes (it is the same for every visitor). Free-depth
// only on purpose: the top 50 of the weekly rankings, the top 10 of the season simulations, and aggregate counts -- see
// lib/hubConfig.js. Every query fails on its own (a missing table just empties that module).

const TOP_RANKED = 50; // free depth of Weekly Projection Rankings
const TOP_SIMS = 10; // free depth of Player Season Simulations

async function safe(fn, fallback) {
  try {
    return (await fn()) ?? fallback;
  } catch {
    return fallback;
  }
}

async function newestWeek(sb, table, season) {
  let q = sb.from(table).select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1);
  if (season != null) q = q.eq("season", season);
  const { data } = await q.maybeSingle();
  return data || null;
}

export const getHubData = unstable_cache(
  async () => {
    const sb = createPublicClient();
    const latest = await safe(() => newestWeek(sb, "redraft_rankings"), null);

    // Weekly rankings: this week's top 50 plus last week's median for the same names (the movers module).
    const rankedP = safe(async () => {
      if (!latest) return { rows: [], total: 0, prev: {} };
      const [{ data: rows }, { count }] = await Promise.all([
        sb
          .from("redraft_rankings")
          .select("rank, player_name, position, team, projection, floor, ceiling")
          .eq("season", latest.season)
          .eq("week", latest.week)
          .order("rank", { ascending: true })
          .limit(TOP_RANKED),
        sb.from("redraft_rankings").select("*", { count: "exact", head: true }).eq("season", latest.season).eq("week", latest.week),
      ]);
      const { data: prevWeek } = await sb
        .from("redraft_rankings")
        .select("week")
        .eq("season", latest.season)
        .lt("week", latest.week)
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prev = {};
      if (prevWeek) {
        const { data: prows } = await sb
          .from("redraft_rankings")
          .select("player_name, projection")
          .eq("season", latest.season)
          .eq("week", prevWeek.week)
          .in("player_name", (rows || []).map((r) => r.player_name));
        for (const r of prows || []) prev[r.player_name] = r.projection;
      }
      return { rows: rows || [], total: count || 0, prev };
    }, { rows: [], total: 0, prev: {} });

    // Season simulations: the free top 10 plus the size of the pool.
    const simsP = safe(async () => {
      const w = await newestWeek(sb, "player_simulations");
      if (!w) return { top: [], total: 0, week: null };
      const [{ data }, { count }] = await Promise.all([
        sb
          .from("player_simulations")
          .select("player_name, position, team, floor, median, ceiling")
          .eq("season", w.season)
          .eq("week", w.week)
          .order("median", { ascending: false })
          .limit(TOP_SIMS),
        sb.from("player_simulations").select("*", { count: "exact", head: true }).eq("season", w.season).eq("week", w.week),
      ]);
      return { top: data || [], total: count || 0, week: w.week };
    }, { top: [], total: 0, week: null });

    // Role / sustainability / career stage groupings (newest week that has any).
    const groupsP = safe(async () => {
      const w = await newestWeek(sb, "player_groups", latest?.season);
      if (!w) return [];
      const { data } = await sb.from("player_groups").select("player_name, position, kind, label, detail").eq("season", w.season).eq("week", w.week).in("kind", ["sustainability", "career_stage"]);
      return data || [];
    }, []);
    const archP = safe(async () => {
      const w = await newestWeek(sb, "player_archetypes", latest?.season);
      if (!w) return [];
      const { data } = await sb.from("player_archetypes").select("position, archetype").eq("season", w.season).eq("week", w.week);
      return data || [];
    }, []);

    const leansP = safe(async () => {
      const w = await newestWeek(sb, "defense_leans", latest?.season);
      if (!w) return [];
      const { data } = await sb.from("defense_leans").select("defense, position, call, score, effect").eq("season", w.season).eq("week", w.week).gte("score", FLAG_MIN_SCORE);
      return data || [];
    }, []);

    // Defenses that actually play this week (a defense on a bye has no matchup to flag).
    const playingP = safe(async () => {
      if (!latest) return [];
      const { data } = await sb.from("redraft_rankings").select("opponent").eq("season", latest.season).eq("week", latest.week).neq("opponent", "NA").limit(1000);
      return [...new Set((data || []).map((r) => r.opponent).filter(Boolean))];
    }, []);

    // Hand-published boards: shown only once they have rows.
    const prospectsP = safe(async () => {
      const { data: top } = await sb.from("prospect_rankings").select("draft_class").order("draft_class", { ascending: false }).limit(1).maybeSingle();
      if (!top) return [];
      const { data } = await sb.from("prospect_rankings").select("rank, player_name, position, school, comp").eq("draft_class", top.draft_class).order("rank", { ascending: true }).limit(12);
      return data || [];
    }, []);
    const draftP = safe(async () => {
      const { data: top } = await sb.from("draft_board").select("season").order("season", { ascending: false }).limit(1).maybeSingle();
      if (!top) return [];
      const { data } = await sb.from("draft_board").select("board_type, round, pick, player_name, position, team, is_stack").eq("season", top.season).eq("board_type", "rookie").eq("round", 1).order("pick", { ascending: true }).limit(8);
      return data || [];
    }, []);

    const [ranked, sims, groups, archetypes, leans, playingDefs, prospects, draft] = await Promise.all([rankedP, simsP, groupsP, archP, leansP, playingP, prospectsP, draftP]);

    const stageOf = new Map();
    const susOf = new Map();
    const stageCounts = {};
    for (const g of groups) {
      if (g.kind === "career_stage") {
        stageOf.set(g.player_name, { stage: g.label, age: g.detail?.age ?? null });
        ((stageCounts[g.position] ??= {})[g.label] ??= 0);
        stageCounts[g.position][g.label] += 1;
      } else if (g.kind === "sustainability") {
        susOf.set(g.player_name, { sus: g.label, fp: g.detail?.fp_pg ?? null, xfp: g.detail?.xfp_pg ?? null });
      }
    }
    const roleCounts = {};
    for (const a of archetypes) {
      ((roleCounts[a.position] ??= {})[a.archetype] ??= 0);
      roleCounts[a.position][a.archetype] += 1;
    }

    const players = ranked.rows.map((r) => {
      const st = stageOf.get(r.player_name);
      const su = susOf.get(r.player_name);
      return {
        n: r.player_name,
        pos: r.position,
        team: r.team,
        rank: r.rank,
        proj: r.projection,
        prev: ranked.prev[r.player_name] ?? null,
        floor: r.floor,
        ceil: r.ceiling,
        stage: st?.stage ?? null,
        age: st?.age ?? null,
        sus: su?.sus ?? null,
        susFp: su?.fp ?? null,
        susXfp: su?.xfp ?? null,
      };
    });

    return {
      latest,
      players,
      sims: sims.top.map((s) => ({ n: s.player_name, pos: s.position, team: s.team, floor: s.floor, median: s.median, ceil: s.ceiling })),
      playingDefs,
      leans: leans.map((l) => ({ def: l.defense, pos: l.position, call: l.call, score: l.score, effect: l.effect })),
      stageCounts,
      roleCounts,
      counts: { ranked: ranked.total, simmed: sims.total, runs: 10000 },
      boards: { prospects, draft },
    };
  },
  ["landing-hub-data"],
  { revalidate: 300 }
);

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { stripe, TIER_BY_PRICE } from "@/lib/billing";
import { subscriptionTier, monthlyCents } from "@/lib/subscriptionTier";
import { summarizeWalls } from "@/lib/wallReport";
import { loadHealth } from "@/lib/health";

// Everything /admin shows, read with the service role (the page itself is founder-only, lib/admin.js). Each section loads
// on its own and carries `error` instead of failing the page, so one broken source (Stripe down, a table not migrated yet)
// never hides the rest.
const DAY = 86_400_000;
const settle = (p) => p.then((value) => ({ value }), (e) => ({ error: e?.message || String(e) }));

async function members(admin) {
  const profiles = await fetchAllRows(admin, "profiles", "id, email, tier, created_at", (q) => q.order("created_at", { ascending: false }).order("id"));
  const now = Date.now();
  const byTier = { stargazer: 0, explorer: 0, singularity: 0 };
  for (const p of profiles) byTier[p.tier] = (byTier[p.tier] || 0) + 1;
  return {
    total: profiles.length,
    byTier,
    last7: profiles.filter((p) => now - Date.parse(p.created_at) < 7 * DAY).length,
    last30: profiles.filter((p) => now - Date.parse(p.created_at) < 30 * DAY).length,
    recent: profiles.slice(0, 12).map((p) => ({ email: p.email, tier: p.tier, created_at: p.created_at })),
    paid: new Set(profiles.filter((p) => p.tier === "explorer" || p.tier === "singularity").map((p) => p.id)),
  };
}

async function revenue() {
  const subs = [];
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    if (["active", "trialing", "past_due", "unpaid"].includes(s.status)) subs.push(s);
    if (subs.length >= 2000) break;
  }
  const byTier = { explorer: 0, singularity: 0 };
  let mrrCents = 0;
  for (const s of subs) {
    const t = subscriptionTier(s, TIER_BY_PRICE);
    if (t !== "stargazer") byTier[t]++;
    mrrCents += monthlyCents(s);
  }
  return {
    live: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") || false,
    active: subs.filter((s) => s.status === "active" || s.status === "trialing").length,
    byTier,
    mrrCents,
    pastDue: subs.filter((s) => s.status === "past_due" || s.status === "unpaid").length,
    cancelling: subs.filter((s) => s.cancel_at_period_end).length,
  };
}

async function walls(admin, paid) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const rows = await fetchAllRows(admin, "wall_hits", "type, wall, user_id, created_at", (q) => q.gte("created_at", since).order("created_at").order("id"));
  return { events: rows.length, walls: summarizeWalls(rows, paid) };
}

async function errors(admin) {
  const { data, error } = await admin.from("app_errors").select("created_at, source, route, path, message, digest").order("created_at", { ascending: false }).limit(25);
  if (error) throw new Error(error.message.includes("app_errors") ? "Run migration 0042_app_errors.sql in the Supabase SQL editor to start recording errors." : error.message);
  return data;
}

async function content(admin) {
  const latestOf = (table, col) => admin.from(table).select(col).order(col, { ascending: false }).limit(1).maybeSingle().then(({ data }) => data?.[col] ?? null);
  const count = (table, filter) => filter(admin.from(table).select("id", { count: "exact", head: true })).then(({ count }) => count ?? 0);
  const [posts, prospectClass, boardSeason] = await Promise.all([
    admin.from("posts").select("id, title, url, published_at").order("published_at", { ascending: false }).limit(10).then(({ data }) => data || []),
    latestOf("prospect_rankings", "draft_class"),
    latestOf("draft_board", "season"),
  ]);
  const [prospects, startup, rookie] = await Promise.all([
    prospectClass ? count("prospect_rankings", (q) => q.eq("draft_class", prospectClass)) : 0,
    boardSeason ? count("draft_board", (q) => q.eq("season", boardSeason).eq("board_type", "startup")) : 0,
    boardSeason ? count("draft_board", (q) => q.eq("season", boardSeason).eq("board_type", "rookie")) : 0,
  ]);
  return { posts, prospects: { draftClass: prospectClass, rows: prospects }, board: { season: boardSeason, startup, rookie } };
}

export async function loadAdminData() {
  const admin = createAdminClient();
  const [health, memberData, rev, errs, cont] = await Promise.all([settle(loadHealth()), settle(members(admin)), settle(revenue()), settle(errors(admin)), settle(content(admin))]);
  const wallData = await settle(walls(admin, memberData.value?.paid || new Set()));
  return { health, members: memberData, revenue: rev, walls: wallData, errors: errs, content: cont };
}

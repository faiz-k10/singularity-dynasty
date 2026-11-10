// Weekly "Your Players This Week" email for Explorer and Singularity members who turned it on (My Team -> the panel's switch).
//
//   node --env-file=.env.local scripts/send-weekly-digest.mjs            dry run: renders every email to scripts/_digest_preview/, sends nothing
//   node --env-file=.env.local scripts/send-weekly-digest.mjs --send     sends through Resend
//   node --env-file=.env.local scripts/send-weekly-digest.mjs --demo     renders ONE email for the first member with saved teams (opted in or not), never sends
//
// To send for real you need (one-time, your accounts): a Resend account with a verified sending domain, and in .env.local
//   RESEND_API_KEY=...   EMAIL_FROM="Dynasty Singularity <digest@yourdomain.com>"   NEXT_PUBLIC_SITE_URL=https://yourdomain.com
//   EMAIL_FOOTER_ADDRESS="your business mailing address"   (US law requires a postal address and a working off switch in marketing email)
// and migration 0038 run in the Supabase SQL editor (adds profiles.email_digest). Run it Tuesday after the projections publish.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { mineFromTeams } from "../lib/myPlayers.js";
import { buildFeed } from "../lib/myFeed.js";
import { renderDigest } from "../lib/digestEmail.js";

const SEND = process.argv.includes("--send");
const DEMO = process.argv.includes("--demo");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://web-kohl-ten-94.vercel.app").replace(/\/$/, "");
const address = process.env.EMAIL_FOOTER_ADDRESS || "";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function all(table, select, apply) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// The two most recent published weeks of a table (same idea as lib/myFeedData.js, without Next's cache).
async function twoWeeks(table, select) {
  const { data: latest } = await sb.from(table).select("season, week").order("season", { ascending: false }).order("week", { ascending: false }).limit(1).maybeSingle();
  if (!latest) return null;
  const { data: prevRow } = await sb.from(table).select("week").eq("season", latest.season).lt("week", latest.week).order("week", { ascending: false }).limit(1).maybeSingle();
  const at = (week) => all(table, select, (q) => q.eq("season", latest.season).eq("week", week));
  const [cur, prev] = await Promise.all([at(latest.week), prevRow ? at(prevRow.week) : []]);
  return { season: latest.season, week: latest.week, prevWeek: prevRow?.week ?? null, cur, prev };
}

const [sims, ranks, roles, groups] = await Promise.all([
  twoWeeks("player_simulations", "player_name, position, median, floor, ceiling").catch(() => null),
  twoWeeks("redraft_rankings", "player_name, position, rank, week, opponent, is_home, notes").catch(() => null),
  twoWeeks("player_archetypes", "player_name, archetype").catch(() => null),
  twoWeeks("player_groups", "player_name, kind, label").catch(() => null),
]);
const week = sims?.week ?? ranks?.week;
const pair = (x) => (x ? { cur: x.cur, prev: x.prev } : undefined);
const feedArgs = { sims: pair(sims), ranks: pair(ranks), roles: pair(roles), groups: pair(groups), simPrevWeek: sims?.prevWeek ?? null };

// Who gets one.
let members = [];
if (DEMO) {
  const { data: t } = await sb.from("saved_teams").select("user_id").limit(1);
  const id = t?.[0]?.user_id;
  if (!id) {
    console.log("No saved teams anywhere yet -- nothing to demo.");
    process.exit(0);
  }
  const { data: p } = await sb.from("profiles").select("id, email, tier").eq("id", id).maybeSingle();
  members = p ? [p] : [];
} else {
  const { data, error } = await sb.from("profiles").select("id, email, tier").eq("email_digest", true).in("tier", ["explorer", "singularity"]);
  if (error) {
    console.error(/email_digest/.test(error.message) ? "Run migration 0038 first (profiles.email_digest is missing)." : error.message);
    process.exit(1);
  }
  members = data || [];
}
console.log(`${members.length} member(s) to email for week ${week}${SEND && !DEMO ? "" : " (dry run)"}.`);

mkdirSync(new URL("./_digest_preview/", import.meta.url), { recursive: true });
let sent = 0;
for (const m of members) {
  const { data: rows } = await sb.from("saved_teams").select("league_name, team_name, players").eq("user_id", m.id).order("created_at", { ascending: true });
  if (!rows?.length) continue;
  const mine = mineFromTeams(rows);
  const feed = buildFeed({ mine, ...feedArgs });
  if (!feed.items.length) {
    console.log(`  - ${m.email}: nothing moved, skipped`);
    continue;
  }
  const mail = renderDigest({ items: feed.items, week, siteUrl, address });
  if (!SEND || DEMO) {
    const file = new URL(`./_digest_preview/${m.id}.html`, import.meta.url);
    writeFileSync(file, mail.html);
    console.log(`  - ${m.email}: "${mail.subject}" -> scripts/_digest_preview/${m.id}.html`);
    continue;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: m.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: { "List-Unsubscribe": `<${siteUrl}/my-team>` },
    }),
  });
  if (res.ok) {
    sent += 1;
    console.log(`  - ${m.email}: sent`);
  } else {
    console.error(`  - ${m.email}: FAILED ${res.status} ${await res.text()}`);
  }
}
if (SEND && !DEMO) console.log(`Sent ${sent} of ${members.length}.`);

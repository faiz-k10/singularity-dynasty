// Removes Observatory share cards older than 90 days from the public `lab-shares` bucket (Nov 11 2026 pre-launch check: nothing ever
// removed them, ~300KB each, and the bucket counts against the Supabase storage quota). A removed share's link (/s/<id>) shows the
// "not found" page. Run by `weekly-run.mjs tuesday` (never fatal); by hand: node --env-file=.env.local scripts/clean-lab-shares.mjs [--dry]
import { createClient } from "@supabase/supabase-js";

const DAYS = 90;
const dry = process.argv.includes("--dry");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from("lab-shares");
const cutoff = Date.now() - DAYS * 86400e3;
const old = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await bucket.list("", { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw error;
  for (const f of data || []) if (f.created_at && Date.parse(f.created_at) < cutoff) old.push(f.name);
  if (!data || data.length < 1000) break;
}
console.log(`${old.length} share file(s) older than ${DAYS} days${dry ? " (dry run, nothing removed)" : ""}.`);
for (let i = 0; !dry && i < old.length; i += 100) {
  const { error } = await bucket.remove(old.slice(i, i + 100));
  if (error) throw error;
}

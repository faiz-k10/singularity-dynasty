// Publisher for model/upload_player_directory.csv -> player_directory (migration 0039). Upserts every row by sleeper_id, then removes
// rows no longer in the CSV (a player who left the league's view must not linger).
// Exits 2 if the table doesn't exist yet (run supabase/migrations/0039_player_directory.sql once).
// Run: node --env-file=.env.local scripts/publish-player-directory.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// write.csv(na = "") output: text quoted, numbers bare, NA as an empty field.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cur), (cur = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) (row.push(cur), rows.push(row));
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
const text = (v) => (v === "" || v == null ? null : v);
const int = (v) => (v === "" || v == null ? null : Math.round(Number(v)));
const dec = (v) => (v === "" || v == null ? null : Number(v));

const rows = parseCsv(readFileSync(new URL("../../model/upload_player_directory.csv", import.meta.url), "utf8"));
if (rows.length < 1000) {
  console.error(`Only ${rows.length} rows parsed from CSV, aborting.`);
  process.exit(1);
}
const now = new Date().toISOString();
const payload = rows.map((r) => ({
  sleeper_id: r.sleeper_id,
  gsis_id: text(r.gsis_id),
  first_name: text(r.first_name),
  last_name: text(r.last_name),
  position: text(r.position),
  team: text(r.team),
  number: int(r.number),
  height: text(r.height),
  weight: int(r.weight),
  age: dec(r.age),
  birth_date: text(r.birth_date),
  years_exp: int(r.years_exp),
  college: text(r.college),
  status: text(r.status),
  headshot_url: text(r.headshot_url),
  updated_at: now,
}));
console.log(`Parsed ${payload.length} players.`);

for (let i = 0; i < payload.length; i += 500) {
  const { error } = await supabase.from("player_directory").upsert(payload.slice(i, i + 500), { onConflict: "sleeper_id" });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || /player_directory/.test(error.message || "")) {
      console.error("player_directory table not found -- run supabase/migrations/0039_player_directory.sql in the Supabase SQL editor first.");
      process.exit(2);
    }
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }
}
// Rows from earlier runs that this one didn't write.
const { error: delErr, count } = await supabase.from("player_directory").delete({ count: "exact" }).lt("updated_at", now);
if (delErr) {
  console.error("Cleanup failed:", delErr.message);
  process.exit(1);
}
const { count: total } = await supabase.from("player_directory").select("*", { count: "exact", head: true });
console.log(`Verified: player_directory = ${total} rows (${count ?? 0} stale removed)`);

// Publish the Dynasty Board's data (model/run_dynasty.sh -> web/data/dynasty-values.json + dynasty-logs.json) to the private Storage
// bucket "dynasty", which the site reads (lib/dynastyData.js; the copy in web/data is the fallback the site ships with). Run by
// weekly-run.mjs tuesday-full-run; by hand: node --env-file=.env.local scripts/publish-dynasty.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const BUCKET = "dynasty";
const values = fs.readFileSync(path.join(DATA, "dynasty-values.json"), "utf8");
const logs = fs.readFileSync(path.join(DATA, "dynasty-logs.json"), "utf8");

// sanity: a broken build must not replace a good board
const v = JSON.parse(values), l = JSON.parse(logs);
if (!Array.isArray(v.rows) || v.rows.length < 200) throw new Error(`dynasty-values.json has ${v.rows?.length ?? 0} rows; refusing to publish`);
if (!v.last_week) throw new Error("dynasty-values.json has no last_week; refusing to publish");
if (Object.keys(l).length < 200) throw new Error("dynasty-logs.json looks empty; refusing to publish");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error: be } = await supabase.storage.getBucket(BUCKET);
if (be) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error) throw new Error(`could not create bucket ${BUCKET}: ${error.message}`);
}
for (const [name, text] of [["dynasty-values.json", values], ["dynasty-logs.json", logs]]) {
  const { error } = await supabase.storage.from(BUCKET).upload(name, text, { contentType: "application/json", upsert: true });
  if (error) throw new Error(`upload ${name}: ${error.message}`);
}
console.log(`Published the Dynasty Board through ${v.last_week} (${v.rows.length} players, built ${v.built}).`);

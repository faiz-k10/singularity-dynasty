// Creates the public Storage bucket The Observatory's shared charts live in (lib/labShare.js SHARE_BUCKET): <id>.png (the chart card) and <id>.json
// (title, caption, Lab view). Public read so the share page's link preview works for every platform; only the server (service role, app/api/
// lab-share) writes. Idempotent: an existing bucket gets the same settings.
// Run: node --env-file=.env.local scripts/setup-lab-shares-bucket.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = "lab-shares";
const options = { public: true, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ["image/png", "application/json"] };

const { data: existing } = await supabase.storage.getBucket(BUCKET);
const { error } = existing ? await supabase.storage.updateBucket(BUCKET, options) : await supabase.storage.createBucket(BUCKET, options);
if (error) {
  console.error(`Couldn't ${existing ? "update" : "create"} bucket ${BUCKET}:`, error.message);
  process.exit(1);
}
console.log(`Bucket ${BUCKET} ${existing ? "updated" : "created"} (public read, 4MB, PNG + JSON).`);

// After `next build`: searches everything a visitor can download (the browser JavaScript in .next/static and the pre-rendered pages in
// .next/server/app) for secret-looking text, and -- when the real keys are in the environment (locally, with .env.local) -- for the exact
// value of every secret key. Prints only file names and which kind of secret, never a value. Exit 1 on any hit.
//   npm run check:secrets          (CI runs it after the build)
import fs from "node:fs";
import path from "node:path";
import { findSecrets, secretValues } from "../lib/secretGuard.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dirs = [path.join(root, ".next/static"), path.join(root, ".next/server/app")];
const values = secretValues(process.env);
const hits = [];
let files = 0;

function scan(file, shipped) {
  const text = fs.readFileSync(file, "utf8");
  files++;
  const rel = path.relative(root, file);
  for (const [key, v] of values) if (text.includes(v)) hits.push(`${rel}: contains the value of ${key}`);
  if (shipped) for (const s of findSecrets(text)) hits.push(`${rel}: looks like ${s.name}`);
}
function walk(dir, inServer) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, inServer);
    // in .next/server only the pages sent as-is (html, rsc, body, meta) reach a browser; the server's own code never does
    else if (inServer ? /\.(html|rsc|body|meta|txt)$/.test(e.name) : /\.(js|mjs|css|json|html|txt|map)$/.test(e.name)) scan(p, true);
  }
}
if (!fs.existsSync(dirs[0])) { console.error("No build found: run `npm run build` first."); process.exit(1); }
walk(dirs[0], false);
walk(dirs[1], true);
console.log(`Checked ${files} files a visitor can download${values.length ? ` against ${values.length} secret values` : " (patterns only: no secret values in this environment)"}.`);
if (hits.length) { console.error(`SECRETS FOUND:\n${hits.join("\n")}`); process.exit(1); }
console.log("No secrets found.");

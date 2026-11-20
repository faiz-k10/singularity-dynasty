import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecrets, publicEnvProblems, jwtRole, secretValues } from "../lib/secretGuard.mjs";

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.c2lnbmF0dXJlc2lnbmF0dXJl`;
const fake = (prefix) => prefix + "A1b2C3d4E5f6G7h8I9j0K1l2"; // built here so this file never holds a real-looking key

test("public variables may hold only public keys", () => {
  assert.deepEqual(publicEnvProblems({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: fake("pk_live_"), NEXT_PUBLIC_SITE_URL: "https://x.com" }), []);
  assert.equal(publicEnvProblems({ NEXT_PUBLIC_STRIPE_KEY: fake("sk_live_") })[0].problem, "Stripe secret key");
  assert.match(publicEnvProblems({ NEXT_PUBLIC_SUPABASE_KEY: jwt("service_role") })[0].problem, /service_role/);
  assert.equal(publicEnvProblems({ NEXT_PUBLIC_OPENAI_API_KEY: "x" })[0].problem, "its name says it is secret");
  assert.deepEqual(publicEnvProblems({ STRIPE_SECRET_KEY: fake("sk_live_") }), []); // a server-only name is fine
});

test("finds secrets in built text without returning them", () => {
  const found = findSecrets(`var a="${fake("sk_test_")}",b="${fake("whsec_")}",c="${jwt("service_role")}",d="${jwt("anon")}"`);
  assert.deepEqual(found.map((f) => f.name).sort(), ['Stripe secret key', 'Stripe webhook secret', 'a "service_role" token (only the anon key may be public)'].sort());
  assert.ok(found.every((f) => !JSON.stringify(f).includes("A1b2")));
  assert.deepEqual(findSecrets("nothing here pk_live_abc"), []);
  assert.equal(jwtRole(jwt("anon")), "anon");
  assert.equal(jwtRole("not.a.jwt"), null);
});

test("only secret-looking server values are compared against the build", () => {
  const keys = secretValues({ STRIPE_SECRET_KEY: fake("sk_live_"), NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", STRIPE_PRICE_EXPLORER_MONTHLY: fake("price_"), EMAIL_FROM: "hi@site.com", NODE_ENV: "production" }).map(([k]) => k);
  assert.deepEqual(keys, ["STRIPE_SECRET_KEY"]);
});

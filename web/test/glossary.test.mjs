import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, glossaryTerm, slug } from "../lib/glossary.js";
import { PROFILE_METRICS } from "../lib/statMetrics.js";

test("glossary: unique anchors, every entry defined", () => {
  const ids = GLOSSARY.flatMap((g) => g.terms.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length, "duplicate anchor ids");
  for (const g of GLOSSARY) for (const t of g.terms) assert.ok(t.term && t.def && t.def.length > 20, t.term);
});

test("glossary: every stat on the site has a definition, found by its field key", () => {
  for (const key of Object.keys(PROFILE_METRICS)) assert.ok(glossaryTerm(key), key);
  assert.equal(glossaryTerm("avgXfp").full, "Expected fantasy points");
  assert.equal(glossaryTerm("Floor").id, "floor");
  assert.equal(glossaryTerm("nope"), null);
  assert.equal(slug("Pace %ile"), "pace-ile");
});

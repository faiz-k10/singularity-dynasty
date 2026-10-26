import { test } from "node:test";
import assert from "node:assert/strict";
import { shareId, isShareId, cleanShareMeta, isPng, composeUrl, allowShare } from "../lib/labShare.js";

test("shareId: 10 readable characters, accepted by isShareId", () => {
  const id = shareId(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]));
  assert.equal(id.length, 10);
  assert.ok(isShareId(id));
  assert.ok(!/[0OlI1]/.test(id));
  assert.equal(isShareId("../etc/pwd"), false);
  assert.equal(isShareId("abc"), false);
});

test("cleanShareMeta: needs a title and a Lab link, trims and caps", () => {
  assert.deepEqual(cleanShareMeta({ title: " Pts/G vs xFP ", caption: "hi", view: "/tools/lab?view=scatter&pos=WR" }), {
    title: "Pts/G vs xFP",
    caption: "hi",
    view: "/tools/lab?view=scatter&pos=WR",
  });
  assert.equal(cleanShareMeta({ title: "x", view: "https://evil.example/" }), null);
  assert.equal(cleanShareMeta({ title: "x", view: "/tools/lab-evil" }), null);
  assert.equal(cleanShareMeta({ title: "", view: "/tools/lab" }), null);
  assert.equal(cleanShareMeta({ title: "a".repeat(500), view: "/tools/lab" }).title.length, 160);
});

test("isPng checks the signature", () => {
  assert.ok(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])));
  assert.equal(isPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])), false);
  assert.equal(isPng(null), false);
});

test("composeUrl writes the post for each platform, nothing for the ones without a compose page", () => {
  const p = { url: "https://site.app/s/abcDEF2345", text: "Pts/G vs xFP · WR" };
  assert.equal(composeUrl("x", p), "https://twitter.com/intent/tweet?text=Pts%2FG%20vs%20xFP%20%C2%B7%20WR&url=https%3A%2F%2Fsite.app%2Fs%2FabcDEF2345");
  assert.ok(composeUrl("threads", p).includes(encodeURIComponent(p.url)));
  assert.ok(composeUrl("bluesky", p).startsWith("https://bsky.app/intent/compose?text="));
  assert.ok(composeUrl("facebook", p).endsWith(encodeURIComponent(p.url)));
  assert.ok(composeUrl("linkedin", p).includes("share-offsite"));
  assert.ok(composeUrl("reddit", p).includes("&title="));
  assert.equal(composeUrl("discord", p), null);
  assert.equal(composeUrl("instagram", p), null);
});

test("allowShare caps shares per address in the window", () => {
  const hits = new Map();
  for (let i = 0; i < 3; i++) assert.ok(allowShare(hits, "1.2.3.4", 1000 + i, 3, 60000));
  assert.equal(allowShare(hits, "1.2.3.4", 2000, 3, 60000), false);
  assert.ok(allowShare(hits, "5.6.7.8", 2000, 3, 60000));
  assert.ok(allowShare(hits, "1.2.3.4", 1000 + 60001, 3, 60000));
});

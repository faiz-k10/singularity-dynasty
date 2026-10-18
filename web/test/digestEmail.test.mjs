import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDigest } from "../lib/digestEmail.js";

const items = [
  { name: "Josh Allen", position: "QB", starter: true, teams: [{ label: "League A" }, { label: "League B" }], lines: [{ dir: "up", text: "Season median +9 pts (400 → 409)" }, { dir: "flag", text: "Role changed" }, { dir: "down", text: "third line is dropped" }] },
  { name: "A <b>Tricky</b> Name", position: "WR", starter: false, teams: [{ label: "League C" }], lines: [{ dir: "down", text: "Listed OUT for week 6" }] },
];

test("subject counts the movers and the starters", () => {
  const d = renderDigest({ items, week: 6, siteUrl: "https://x.test" });
  assert.equal(d.subject, "Week 6: 2 of your players moved (1 starting)");
});

test("each player shows at most two lines, with a link and an off switch", () => {
  const d = renderDigest({ items, week: 6, siteUrl: "https://x.test", address: "1 Main St" });
  assert.ok(d.text.includes("Season median +9 pts"));
  assert.ok(!d.text.includes("third line is dropped"));
  assert.ok(d.text.includes("https://x.test/my-team"));
  assert.ok(d.text.includes("Turn this email off"));
  assert.ok(d.html.includes("1 Main St"));
});

test("names are escaped in the HTML body", () => {
  const d = renderDigest({ items, week: 6, siteUrl: "https://x.test" });
  assert.ok(!d.html.includes("<b>Tricky</b>"));
  assert.ok(d.html.includes("&lt;b&gt;Tricky&lt;/b&gt;"));
});

test("no items still renders a calm message", () => {
  const d = renderDigest({ items: [], week: 6, siteUrl: "https://x.test" });
  assert.equal(d.subject, "Week 6: your players this week");
  assert.ok(d.text.includes("Nothing moved enough"));
});

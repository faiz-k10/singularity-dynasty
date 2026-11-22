import test from "node:test";
import assert from "node:assert/strict";
import { dynastyStory } from "../lib/dynastyStory.js";

const base = { name: "Jahmyr Gibbs", pos: "RB", age: 24.5, score: 9.5, ppg: 21.4, move: 1.8, runway: 3.5, prevRank: 6 };
const ctx = { rank: 2, prev: 8, scope: "on the board", overall: 2, posRank: 1, next: "Jaxon Smith-Njigba", gapBelow: 0.6, group: "Future Legend",
  tierSize: 2, tierPlace: 2, mates: ["Josh Allen"], repl: 9.8, above: 30, games: 34, doneAge: 28, rebuild: false, viewLabel: "Superflex Contender",
  views: [{ label: "Superflex Contender", rank: 2 }, { label: "1QB Contender", rank: 1 }, { label: "Superflex Rebuilder", rank: 2 }, { label: "1QB Rebuilder", rank: 2 }],
  coach: { hc: "Dan Campbell", calls: false } };
const all = (s) => [s.lede, ...["worth", "prod", "age", "tier", "league", "staff"].flatMap((k) => [s[k]?.head, s[k]?.close])].filter(Boolean);

test("the lede opens on a climb, with real ranks", () => {
  assert.equal(dynastyStory(base, ctx).lede, "Nine games ago, Jahmyr Gibbs was 8th on the board. He's 2nd now.");
});

test("No. 1 names the runner-up", () => {
  const s = dynastyStory({ ...base, name: "Josh Allen", pos: "QB" }, { ...ctx, rank: 1, prev: 1, next: "Jahmyr Gibbs", gapBelow: 0.5 });
  assert.match(s.lede, /best player on this board, and Gibbs isn't/);
});

test("no generated-text tics: no colons, no dashes, no not-X-but-Y", () => {
  for (const line of all(dynastyStory(base, ctx))) {
    assert.doesNotMatch(line, /[:—–]/, line);
    assert.doesNotMatch(line, /\bnot just\b|\bisn't just\b/i, line);
  }
});

test("each beat hands off to the next one", () => {
  const s = dynastyStory(base, ctx);
  assert.match(s.worth.close, /Here.s where it comes from/);
  assert.match(s.age.close, /^So /);
});

test("rebuilder past his done age is told plainly", () => {
  const s = dynastyStory({ ...base, age: 30.2, runway: -2.2 }, { ...ctx, rebuild: true, prev: 2 });
  assert.match(s.age.close, /problem for a rebuilder/);
});

test("alone in a tier and a league-proof rank", () => {
  const s = dynastyStory(base, { ...ctx, tierSize: 1, mates: [], views: ctx.views.map((v) => ({ ...v, rank: 4 })) });
  assert.match(s.tier.head, /Nobody on the board/);
  assert.equal(s.league.head, "He's No. 4 however your league is set up.");
});

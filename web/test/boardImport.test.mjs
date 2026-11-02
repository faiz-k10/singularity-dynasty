import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../lib/csv.js";
import { parseProspects, parseDraftBoard } from "../lib/boardImport.js";
import { summarizeWalls } from "../lib/wallReport.js";

test("parseCsv: quotes, commas and newlines inside quotes, CRLF, BOM, blank lines", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n"multi\nline",2\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"'],
    ["multi\nline", "2"],
  ]);
  assert.deepEqual(parseCsv(""), []);
});

test("parseProspects: aliases, upper-casing, optional columns", () => {
  const { rows, errors } = parseProspects("Rank,Player,Pos,College\n1,Arch Manning,qb,Texas\n1,Jeremiah Smith,WR,\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], { rank: 1, player_name: "Arch Manning", position: "QB", school: "Texas", comp: null, notes: null });
  assert.equal(rows[1].school, null);
});

test("parseProspects: every problem reported by line, nothing returned", () => {
  const { rows, errors } = parseProspects("rank,player_name,position\n0,A,WR\n2,,RB\n3,C,WR\n3,D,WR\n");
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 4);
  assert.match(errors[0], /^Line 2: rank/);
  assert.ok(errors.some((e) => /Line 3: position must be WR or QB/.test(e)));
  assert.ok(errors.some((e) => /appears twice/.test(e)));
  assert.match(parseProspects("name,school\nA,B")?.errors[0], /Missing columns: rank, position/);
});

test("parseDraftBoard: stacks and teams", () => {
  const { rows, errors } = parseDraftBoard("round,pick,player,position,team,stack,stack note\n1,1,Josh Allen,QB,buf,yes,with Shakir\n1,2,Bijan Robinson,RB,ATL,,\n");
  assert.deepEqual(errors, []);
  assert.equal(rows[0].team, "BUF");
  assert.equal(rows[0].is_stack, true);
  assert.equal(rows[1].is_stack, false);
  assert.match(parseDraftBoard("round,pick,player,position\n1,1,A,QB\n1,1,B,RB").errors[0], /appears twice/);
});

test("summarizeWalls: views, clicks, click rate, clickers and who is paid now", () => {
  const s = summarizeWalls(
    [
      { wall: "lab", type: "view" },
      { wall: "lab", type: "view" },
      { wall: "lab", type: "click", user_id: "u1" },
      { wall: "nav", type: "click", user_id: "u2" },
    ],
    new Set(["u1"])
  );
  assert.deepEqual(s[0], { wall: "lab", views: 2, clicks: 1, clickPct: 50, clickers: 1, upgraded: 1 });
  assert.equal(s[1].clickPct, null);
});

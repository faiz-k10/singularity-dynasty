import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSort, sortHref, sortArrow, sortRows } from "../lib/sortLink.js";

test("resolveSort: falls back to defaults when no sort param", () => {
  assert.deepEqual(resolveSort({}, "median", "desc"), { sortKey: "median", sortDir: "desc" });
  assert.deepEqual(resolveSort(undefined, "name"), { sortKey: "name", sortDir: "asc" });
});

test("resolveSort: honours an explicit sort param, dir defaults to asc", () => {
  assert.deepEqual(resolveSort({ sort: "floor" }, "median", "desc"), { sortKey: "floor", sortDir: "asc" });
  assert.deepEqual(resolveSort({ sort: "floor", dir: "desc" }, "median"), { sortKey: "floor", sortDir: "desc" });
  assert.deepEqual(resolveSort({ sort: "floor", dir: "nonsense" }, "median"), { sortKey: "floor", sortDir: "asc" });
});

test("resolveSort: namespaced params for multiple tables on one page", () => {
  const params = { qb_sort: "age", qb_dir: "desc", wr_sort: "yards" };
  assert.deepEqual(resolveSort(params, "rank", "asc", "qb_sort", "qb_dir"), { sortKey: "age", sortDir: "desc" });
  assert.deepEqual(resolveSort(params, "rank", "asc", "wr_sort", "wr_dir"), { sortKey: "yards", sortDir: "asc" });
});

test("sortHref: first click on a column = desc, then toggles", () => {
  assert.equal(sortHref({}, "median", "name", "asc"), "?sort=median&dir=desc");
  assert.equal(sortHref({}, "median", "median", "desc"), "?sort=median&dir=asc");
  assert.equal(sortHref({}, "median", "median", "asc"), "?sort=median&dir=desc");
});

test("sortHref: preserves unrelated params", () => {
  const href = sortHref({ type: "rookie", sort: "old", dir: "asc" }, "round", "old", "asc");
  const p = new URLSearchParams(href.slice(1));
  assert.equal(p.get("type"), "rookie");
  assert.equal(p.get("sort"), "round");
  assert.equal(p.get("dir"), "desc");
});

test("sortArrow", () => {
  assert.equal(sortArrow("median", "median", "desc"), " ▼");
  assert.equal(sortArrow("median", "median", "asc"), " ▲");
  assert.equal(sortArrow("median", "floor", "desc"), "");
});

const TYPES = { name: "string", pts: "number" };

test("sortRows: number desc, nulls sink to the bottom", () => {
  const rows = [{ name: "a", pts: 5 }, { name: "b", pts: null }, { name: "c", pts: 20 }];
  assert.deepEqual(sortRows(rows, "pts", "desc", TYPES).map((r) => r.name), ["c", "a", "b"]);
  assert.deepEqual(sortRows(rows, "pts", "asc", TYPES).map((r) => r.name), ["b", "a", "c"]);
});

test("sortRows: string sort is case-insensitive", () => {
  const rows = [{ name: "Zeb" }, { name: "abe" }, { name: "Bo" }];
  assert.deepEqual(sortRows(rows, "name", "asc", TYPES).map((r) => r.name), ["abe", "Bo", "Zeb"]);
});

test("sortRows: stable for tied rows (flip comparator, not .reverse())", () => {
  const rows = [
    { name: "first", pts: 10 },
    { name: "second", pts: 10 },
    { name: "third", pts: 10 },
  ];
  // all tied -> original order must be preserved in both directions
  assert.deepEqual(sortRows(rows, "pts", "desc", TYPES).map((r) => r.name), ["first", "second", "third"]);
  assert.deepEqual(sortRows(rows, "pts", "asc", TYPES).map((r) => r.name), ["first", "second", "third"]);
});

test("sortRows: unknown key or no key -> rows unchanged (same reference)", () => {
  const rows = [{ name: "a" }, { name: "b" }];
  assert.equal(sortRows(rows, "missing", "asc", TYPES), rows);
  assert.equal(sortRows(rows, null, "asc", TYPES), rows);
});

// Shared by every /tools/* table: sort state lives entirely in the URL
// (?sort=col&dir=asc|desc), matching the existing view/type toggle pattern
// on these pages — no client component needed just to sort a table.
//
// Pages that render several independent tables at once (redraft's By
// Position columns, draft board's per-round tables, prospect rankings'
// WR/QB groups) pass a namespaced sortParam/dirParam per table (e.g.
// "qb_sort"/"qb_dir") so sorting one table doesn't re-sort the others.

export function resolveSort(
  params,
  defaultKey,
  defaultDir = "asc",
  sortParam = "sort",
  dirParam = "dir"
) {
  const sortKey = params?.[sortParam] || defaultKey;
  const sortDir = params?.[sortParam]
    ? params?.[dirParam] === "desc"
      ? "desc"
      : "asc"
    : defaultDir;
  return { sortKey, sortDir };
}

export function sortHref(
  currentParams,
  sortKey,
  activeSort,
  activeDir,
  sortParam = "sort",
  dirParam = "dir"
) {
  const params = new URLSearchParams(currentParams || {});
  const nextDir = activeSort === sortKey && activeDir === "asc" ? "desc" : "asc";
  params.set(sortParam, sortKey);
  params.set(dirParam, nextDir);
  return `?${params.toString()}`;
}

export function sortArrow(sortKey, activeSort, activeDir) {
  if (sortKey !== activeSort) return "";
  return activeDir === "desc" ? " ▼" : " ▲";
}

function compareValues(a, b, type) {
  if (type === "number") {
    const an = a === null || a === undefined ? -Infinity : Number(a);
    const bn = b === null || b === undefined ? -Infinity : Number(b);
    return an - bn;
  }
  const as = (a ?? "").toString().toLowerCase();
  const bs = (b ?? "").toString().toLowerCase();
  return as.localeCompare(bs);
}

export function sortRows(rows, sortKey, dir, columnTypes) {
  if (!sortKey || !columnTypes[sortKey]) return rows;
  const sorted = [...rows].sort((a, b) =>
    compareValues(a[sortKey], b[sortKey], columnTypes[sortKey])
  );
  return dir === "desc" ? sorted.reverse() : sorted;
}

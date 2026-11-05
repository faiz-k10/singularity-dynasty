import Link from "next/link";
import { sortHref, sortArrow } from "@/lib/sortLink";

export default function SortableTh({
  label,
  sortKey,
  activeSort,
  activeDir,
  currentParams,
  sortParam = "sort",
  dirParam = "dir",
  onSort, // given: sort in the browser (useClientSort) instead of navigating to the sorted URL
}) {
  if (onSort) {
    return (
      <th aria-sort={sortKey === activeSort ? (activeDir === "desc" ? "descending" : "ascending") : undefined}>
        <button type="button" className={`th-sort-btn${sortKey === activeSort ? " sort-active" : ""}`} onClick={() => onSort(sortKey)}>
          {label}
          {sortArrow(sortKey, activeSort, activeDir)}
        </button>
      </th>
    );
  }
  return (
    <th>
      <Link
        href={sortHref(currentParams, sortKey, activeSort, activeDir, sortParam, dirParam)}
        className={sortKey === activeSort ? "sort-active" : ""}
        scroll={false}
        // A sort is an explicit click; prefetching every column's sorted view
        // on page load cost a server render each (~12 per page view).
        prefetch={false}
      >
        {label}
        {sortArrow(sortKey, activeSort, activeDir)}
      </Link>
    </th>
  );
}

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
  title,
}) {
  return (
    <th title={title}>
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

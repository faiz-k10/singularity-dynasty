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
}) {
  return (
    <th>
      <Link
        href={sortHref(currentParams, sortKey, activeSort, activeDir, sortParam, dirParam)}
        className={sortKey === activeSort ? "sort-active" : ""}
      >
        {label}
        {sortArrow(sortKey, activeSort, activeDir)}
      </Link>
    </th>
  );
}

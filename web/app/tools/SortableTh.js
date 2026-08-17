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
      >
        {label}
        {sortArrow(sortKey, activeSort, activeDir)}
      </Link>
    </th>
  );
}

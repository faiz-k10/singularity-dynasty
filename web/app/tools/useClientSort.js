"use client";

import { useCallback, useState } from "react";
import { nextSortDir } from "@/lib/sortLink";

// Sorting a big table in the browser: the header click re-sorts the rows already on the page and writes ?sort / ?dir into the address bar with
// history.replaceState (so a reload or a shared link keeps the order) WITHOUT a navigation -- a navigation re-rendered the whole page on the
// server, showed the loading skeleton and threw the viewer out of full-screen (founder, Nov 5 2026).
export default function useClientSort(initialKey, initialDir, sortParam = "sort", dirParam = "dir") {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const onSort = useCallback(
    (key) => {
      setSort((prev) => {
        const next = { key, dir: nextSortDir(key, prev.key, prev.dir) };
        try {
          const url = new URL(window.location.href);
          url.searchParams.set(sortParam, next.key);
          url.searchParams.set(dirParam, next.dir);
          window.history.replaceState(window.history.state, "", url);
        } catch {
          // the order still changes on screen
        }
        return next;
      });
    },
    [sortParam, dirParam]
  );
  return { sortKey: sort.key, sortDir: sort.dir, onSort };
}

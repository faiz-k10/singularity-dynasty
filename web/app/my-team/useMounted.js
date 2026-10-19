"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
// False during the server render and hydration, true after: anything formatted in the viewer's own clock / locale
// (kickoff times, "updated 9:34 PM") waits for it, so the server's UTC, 24-hour text never mismatches the browser's.
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

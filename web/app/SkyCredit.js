"use client";

import { useEffect } from "react";
import { creditSky } from "./skyCreditAction";

// Counts a Night Sky task only once the member has USED the tool: the first real click, tap or key press inside the page's main
// content (not the header or menus), while the page is on screen. Opening a page, or the Tools menu preloading it on hover, earns
// nothing. Rendered only for signed-in members; the server checks again and counts each task once a day.
export default function SkyCredit({ action }) {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return undefined;
    let done = false;
    const onUse = (e) => {
      if (done || !e.isTrusted || document.visibilityState !== "visible") return;
      done = true;
      main.removeEventListener("pointerdown", onUse);
      main.removeEventListener("keydown", onUse);
      creditSky(action).catch(() => {});
    };
    main.addEventListener("pointerdown", onUse);
    main.addEventListener("keydown", onUse);
    return () => {
      main.removeEventListener("pointerdown", onUse);
      main.removeEventListener("keydown", onUse);
    };
  }, [action]);
  return null;
}

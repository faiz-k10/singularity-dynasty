"use client";

import { useEffect } from "react";

// TEMPORARY diagnostic (Oct 24 2026): what does a link click cost in the browser? From the click to (a) the loading skeleton showing, (b) the new page
// replacing it and painting, with the RSC requests that carried it (time to first byte, download, size). Reported with sendBeacon to
// /api/nav-timing, which writes one "[nav]" line to the runtime logs (`vercel logs -q "[nav]"`). Remove with that route once the slow step is found.
export default function NavTiming() {
  useEffect(() => {
    let t0 = null;
    let from = null;
    let to = null;
    let skel = null;
    let timer = null;
    const finish = () => {
      if (t0 == null) return;
      const now = performance.now();
      const res = performance
        .getEntriesByType("resource")
        .filter((e) => e.startTime >= t0 - 5 && (e.name.includes("_rsc") || e.initiatorType === "fetch") && !e.name.includes("nav-timing"))
        .map((e) => ({
          u: new URL(e.name).pathname.slice(0, 40),
          wait: Math.round(e.responseStart - e.requestStart),
          dl: Math.round(e.responseEnd - e.responseStart),
          kb: Math.round((e.encodedBodySize || 0) / 1024),
          raw: Math.round((e.decodedBodySize || 0) / 1024),
          at: Math.round(e.startTime - t0),
        }))
        .slice(0, 8);
      const body = JSON.stringify({ from, to, skelMs: skel, pageMs: Math.round(now - t0), res });
      if (body.length < 1800) navigator.sendBeacon?.("/api/nav-timing", body);
      t0 = null;
    };
    const check = () => {
      if (t0 == null) return;
      if (skel == null && document.querySelector(".page-skel")) skel = Math.round(performance.now() - t0);
      if (location.pathname !== from && !document.querySelector(".page-skel")) {
        requestAnimationFrame(() => requestAnimationFrame(finish)); // painted
        setTimeout(finish, 250); // ...or a quarter second later where frames are paused (a background tab); the first one wins
      }
    };
    const onClick = (e) => {
      const a = e.target.closest?.("a[href^='/']");
      if (!a || e.metaKey || e.ctrlKey || a.target === "_blank") return;
      t0 = performance.now();
      from = location.pathname;
      to = a.getAttribute("href").slice(0, 60);
      skel = null;
      clearInterval(timer);
      let ticks = 0;
      timer = setInterval(() => {
        check();
        if (t0 == null || ++ticks > 400) clearInterval(timer); // 20s at most
      }, 50);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearInterval(timer);
    };
  }, []);
  return null;
}

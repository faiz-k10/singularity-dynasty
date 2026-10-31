"use client";

import { useEffect } from "react";

// Paywall telemetry (supabase/migrations/0040_wall_hits.sql, app/api/wall/route.js, read with scripts/wall-report.mjs). Mounted once in the layout.
//   VIEW  -- an element carrying data-wall="name" (the teaser blocks, the locked rows) scrolled into view: once per wall per browser session.
//   CLICK -- a link to /#pricing, or a button inside a data-wall block (the My Team checkout buttons), labelled with the nearest wall;
//            a pricing link in the header is "nav", any other is "other".
// Nothing but the wall name, the page's path and the type is sent; the server adds the tier and (when signed in) the account.
const seen = new Set();

function send(type, wall) {
  try {
    const body = JSON.stringify({ type, wall, page: window.location.pathname });
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/wall", new Blob([body], { type: "application/json" })))) {
      fetch("/api/wall", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // telemetry never breaks the page
  }
}

function sessionSeen(wall) {
  if (seen.has(wall)) return true;
  seen.add(wall);
  try {
    const key = `wall:view:${wall}`;
    if (window.sessionStorage.getItem(key)) return true;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // no storage: the in-memory set still dedupes this page load
  }
  return false;
}

export default function WallTracker() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const wall = e.target.getAttribute("data-wall");
          if (wall && !sessionSeen(wall)) send("view", wall);
        }
      },
      { threshold: 0.5 }
    );
    const watch = () => document.querySelectorAll("[data-wall]:not([data-wall-watched])").forEach((el) => {
      el.setAttribute("data-wall-watched", "");
      io.observe(el);
    });
    watch();
    // walls that render later (My Team's panels, tabs) are picked up as they appear
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(watch);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    const onClick = (e) => {
      const el = e.target instanceof Element ? e.target.closest("a[href], button") : null;
      if (!el) return;
      const wallEl = el.closest("[data-wall]");
      const toPricing = el.tagName === "A" && /#pricing$/.test(el.getAttribute("href") || "");
      if (!toPricing && !(wallEl && el.tagName === "BUTTON")) return;
      send("click", wallEl?.getAttribute("data-wall") || (el.closest("header, .site-header, .top-nav-bar, .radial-menu") ? "nav" : "other"));
    };
    document.addEventListener("click", onClick, true);
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}

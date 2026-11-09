"use client";

import { startCheckout } from "@/lib/startCheckout";

import { useEffect } from "react";

export default function InteractiveScript() {
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const isFinePointer = window.matchMedia(
      "(hover:hover) and (pointer:fine)"
    ).matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const observers = [];

    /* ---- scroll to hash on initial load ----
       html{scroll-behavior:smooth} (globals.css) silently breaks the
       browser's native scroll-to-fragment-on-load in some cases, leaving
       the page stuck at the top. Wasn't visible before since every
       top-nav-bar/radial-menu link was same-page-only (#section); now
       they point at /#section and can land here fresh from another page,
       so this needs to be handled explicitly instead of relying on the
       browser's default. "instant" (not "auto") to actually bypass the
       CSS smooth-scroll and match normal anchor-navigation semantics --
       scrollIntoView's "auto" just inherits the CSS scroll-behavior.
       Actively overridden (not just skipped) on an actual page RELOAD,
       not just any load with a hash present -- scrolling past a section
       doesn't push its #hash into the URL (no history.pushState
       anywhere in this file), but a visitor who clicked into
       Tools/Pricing at some point still has that #hash sitting in the
       address bar afterward, and hitting refresh re-runs this same
       mount logic. Merely skipping our OWN scrollIntoView call on
       reload isn't enough: the BROWSER's own native anchor-jump (a
       separate mechanism from anything in this file) still fires on
       reload purely because the URL's hash matches an element id, and
       that's what was actually landing a refresh on Tools instead of
       the top -- our scrollIntoView was never the only thing doing it.
       Explicitly scrolling to 0,0 on reload runs after mount (i.e.
       after that native jump already happened) and overrides it. The
       Navigation Timing API is what tells a real reload apart from a
       fresh navigation/link click here -- a hash landing from an
       actual link click should still jump to that section, only a
       plain refresh should not. */
    let landedViaHash = false;
    const isReload =
      performance.getEntriesByType?.("navigation")?.[0]?.type === "reload";
    if (isReload) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      // Belt-and-suspenders alongside the layout.js scrollRestoration =
      // "manual" script: if a browser's native scroll-position restore
      // ever lands AFTER this synchronous call instead of before it (the
      // exact timing isn't spec-guaranteed the same way across engines),
      // a second scrollTo a couple frames later still wins.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        });
      });
    } else if (window.location.hash) {
      const hashTarget = document.querySelector(window.location.hash);
      if (hashTarget) {
        hashTarget.scrollIntoView({ behavior: "instant", block: "start" });
        landedViaHash = true;
      }
    }

    /* ---- radial mobile menu ---- */
    const menuBtn = document.getElementById("menuBtn");
    const radialMenu = document.getElementById("radialMenu");
    function closeMenu() {
      radialMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.textContent = "☰";
      document.body.style.overflow = "";
    }
    if (menuBtn && radialMenu) {
      menuBtn.addEventListener(
        "click",
        () => {
          const open = radialMenu.classList.toggle("open");
          menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
          menuBtn.textContent = open ? "✕" : "☰";
          document.body.style.overflow = open ? "hidden" : "";
        },
        { signal }
      );
      radialMenu.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", closeMenu, { signal });
      });
    }

    /* ---- orbit side-nav + top nav bar: smooth scroll + scrollspy ----
       Top-nav-bar/radial-menu links point at /#section (not bare #section)
       so they work as a real navigation back to the homepage from any other
       page. Only intercept + smooth-scroll when the link's path matches
       where we already are -- otherwise let the browser do a normal
       cross-page navigation to /#section. */
    const orbitDots = document.querySelectorAll(".orbit-dot");
    const topNavLinks = document.querySelectorAll(
      ".top-nav-bar a[href*='#']:not(.tn-cta)"
    );
    const spyLinks = document.querySelectorAll(
      ".orbit-dot, .top-nav-bar a[href*='#'], .radial-menu a[href*='#']"
    );
    spyLinks.forEach((link) => {
      link.addEventListener(
        "click",
        (e) => {
          const href = link.getAttribute("href");
          const hashIndex = href.indexOf("#");
          if (hashIndex === -1) return;
          const path = href.slice(0, hashIndex) || "/";
          if (path !== window.location.pathname) return;
          const target = document.querySelector(href.slice(hashIndex));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: reducedMotion ? "auto" : "smooth",
              block: "start",
            });
          }
        },
        { signal }
      );
    });
    const spySections = ["hero", "tools", "feed", "pricing"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if ("IntersectionObserver" in window && spySections.length) {
      const spy = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              orbitDots.forEach((dot) => {
                dot.classList.toggle(
                  "active",
                  dot.getAttribute("href") === "#" + id
                );
              });
              topNavLinks.forEach((link) => {
                link.classList.toggle(
                  "active",
                  link.getAttribute("href") === "#" + id
                );
              });
            }
          });
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
      );
      spySections.forEach((s) => spy.observe(s));
      observers.push(spy);
    }

    /* ---- event horizon scroll meter ---- */
    const ehFill = document.getElementById("ehFill");
    const ehPct = document.getElementById("ehPct");
    const ehCircumference = 2 * Math.PI * 22;
    if (ehFill) {
      ehFill.style.strokeDasharray = ehCircumference;
    }
    let ehTicking = false;
    function updateEH() {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const frac = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
      if (ehFill) {
        ehFill.style.strokeDashoffset = ehCircumference * (1 - frac);
      }
      if (ehPct) {
        ehPct.textContent = Math.round(frac * 100) + "%";
      }
      ehTicking = false;
    }
    window.addEventListener(
      "scroll",
      () => {
        if (!ehTicking) {
          requestAnimationFrame(updateEH);
          ehTicking = true;
        }
      },
      { passive: true, signal }
    );
    updateEH();

    /* ---- scroll reveal ----
       threshold:0.15 means an element only earns "in" once 15% of ITS
       OWN height has crossed into view -- fine for a user scrolling
       down from the top, since everything above the fold reveals
       naturally as they go. But landing straight on a section via a nav
       link's #hash (see scroll-to-hash above) can leave content near
       the bottom of that section only barely peeking above the fold at
       less than 15%, e.g. Feed's subscribe form -- and since nothing
       re-triggers the observer unless the user scrolls further, that
       content stays permanently blurred/dim even though it's the exact
       thing they navigated here to see. The reveal-on-arrival premise
       doesn't apply to a deep-link landing anyway (they didn't scroll
       past anything to get here), so hash landings skip the animation
       entirely, same as the reduced-motion case. */
    const revealEls = document.querySelectorAll(".reveal");
    if (reducedMotion || landedViaHash || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("in"));
    } else {
      const ro = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              ro.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      revealEls.forEach((el) => ro.observe(el));
      observers.push(ro);
    }

    /* ---- orbital tool selector ---- */
    const nodes = document.querySelectorAll(".node");
    const hubPanels = document.querySelectorAll(".hub-panel");
    nodes.forEach((node) => {
      node.addEventListener(
        "click",
        () => {
          nodes.forEach((n) => n.classList.remove("active"));
          node.classList.add("active");
          const idx = node.getAttribute("data-panel");
          hubPanels.forEach((p) => p.classList.remove("active"));
          const match = document.querySelector(
            `.hub-panel[data-panel="${idx}"]`
          );
          if (match) match.classList.add("active");
        },
        { signal }
      );
    });

    /* ---- CSV export (Singularity-only — the button/data only exist in the
       DOM for eligible users, this just wires up the click) ---- */
    function csvEscape(value) {
      const str = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }
    document.querySelectorAll("[data-csv-export]").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const src = document.getElementById(btn.getAttribute("data-csv-export"));
          if (!src) return;
          const { columns, rows } = JSON.parse(src.textContent);
          const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
          rows.forEach((row) => {
            lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
          });
          const blob = new Blob([lines.join("\n")], {
            type: "text/csv;charset=utf-8;",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = btn.getAttribute("data-csv-filename") || "export.csv";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        { signal }
      );
    });

    /* ---- billing toggle ---- */
    // Annual is the default (the page renders with it on): the engaged player plays all year, and it is the cheaper way in.
    const toggle = document.getElementById("billingToggle");
    let annual = toggle ? toggle.classList.contains("on") : true;
    if (toggle) {
      toggle.addEventListener(
        "click",
        () => {
          annual = !annual;
          toggle.classList.toggle("on", annual);
          toggle.setAttribute("aria-pressed", String(annual));
          document.querySelectorAll(".price-amt").forEach((el) => {
            el.textContent = annual
              ? el.dataset.annual
              : el.dataset.monthly;
          });
          document.querySelectorAll(".round-bill").forEach((el) => {
            el.textContent = annual ? el.dataset.annual : el.dataset.monthly;
          });
        },
        { signal }
      );
    }


    /* ---- stripe checkout ---- */
    document.querySelectorAll("[data-plan]").forEach((btn) => {
      btn.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          const plan = btn.getAttribute("data-plan");
          const originalText = btn.textContent;
          if (plan !== "stargazer") {
            btn.textContent = "Redirecting…";
            btn.style.pointerEvents = "none";
          }
          try {
            await startCheckout(plan, annual ? "annual" : "monthly");
          } catch (err) {
            console.error(err);
            alert("Something went wrong starting checkout. Please try again.");
            btn.textContent = originalText;
            btn.style.pointerEvents = "";
          }
        },
        { signal }
      );
    });

    /* ---- starfield parallax ---- */
    if (isFinePointer && !reducedMotion) {
      document.addEventListener(
        "mousemove",
        (e) => {
          const px = (e.clientX / window.innerWidth - 0.5) * 16;
          const py = (e.clientY / window.innerHeight - 0.5) * 16;
          document.documentElement.style.setProperty("--px", px.toFixed(2));
          document.documentElement.style.setProperty("--py", py.toFixed(2));
        },
        { signal }
      );
    }

    /* ---- click-and-drag horizontal scroll for wide data tables ---- */
    // The scroll-affordance problem isn't that these tables can't scroll
    // (overflow-x:auto already works) -- it's that nothing signals a
    // desktop mouse user they should try. Trackpad/touch users already
    // discover it naturally via a horizontal swipe; this adds the same
    // grab-and-drag interaction, so a
    // plain mouse can pull the table sideways too, plus a visible custom
    // scrollbar (globals.css) as the passive cue.
    document.querySelectorAll(".rankings-table-wrap").forEach((wrap) => {
      let dragging = false;
      let startX = 0;
      let startScrollLeft = 0;
      wrap.addEventListener(
        "pointerdown",
        (e) => {
          if (e.pointerType === "touch") return; // native touch scroll is already fine
          // setPointerCapture redirects ALL subsequent pointer events
          // (including the ones the browser uses to synthesize a click)
          // to `wrap`, which silently ate clicks on anything interactive
          // inside it -- sortable column header links stopped navigating,
          // and (same bug, different element) clicking a player row to
          // expand its stat detail panel stopped working too, since that
          // row is a <tr role="button"> with an onClick, not an <a>/
          // <button>. `summary` is here for the same reason -- the
          // /my-team Exposure groups nest a table wrap inside a
          // <details>, and capturing the pointer on a summary press ate
          // the toggle click. Skip drag-init on any of these so real
          // clicks work normally; only a press starting on genuinely
          // inert cell content begins a drag.
          if (e.target.closest('a, button, [role="button"], summary')) return;
          dragging = true;
          wrap.setPointerCapture(e.pointerId);
          startX = e.clientX;
          startScrollLeft = wrap.scrollLeft;
          wrap.classList.add("rankings-table-wrap-grabbing");
        },
        { signal }
      );
      // Never calls preventDefault -- a plain click (e.g. a sortable
      // column header's link) still fires normally on pointerup even
      // though this changed scrollLeft along the way.
      wrap.addEventListener(
        "pointermove",
        (e) => {
          if (!dragging) return;
          wrap.scrollLeft = startScrollLeft - (e.clientX - startX);
        },
        { signal }
      );
      ["pointerup", "pointercancel"].forEach((evt) => {
        wrap.addEventListener(
          evt,
          () => {
            dragging = false;
            wrap.classList.remove("rankings-table-wrap-grabbing");
          },
          { signal }
        );
      });
    });

    /* ---- frozen table header offset (Player Season Simulations) ----
       Measures the real fixed ticker+nav stack instead of hardcoding its
       height, so the sticky table header/top-scrollbar (globals.css)
       stay correctly positioned even if that stack's height ever
       changes (a longer/shorter nav, a new ticker row, mobile layout
       switching to the hamburger fallback, etc). No-ops harmlessly on
       any page without .site-header. */
    function measureFixedHeaderHeight() {
      const header = document.querySelector(".site-header");
      if (!header) return;
      const height = header.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty("--fixed-header-height", `${height}px`);
    }
    measureFixedHeaderHeight();
    window.addEventListener("resize", measureFixedHeaderHeight, { signal });

    return () => {
      controller.abort();
      observers.forEach((o) => o.disconnect());
    };
    // Mount-once: this effect wires every listener exactly once. (The ticker is its own component, TickerTrack.js, so
    // it can stream in after the page without holding any of this back.)
  }, []);

  return null;
}

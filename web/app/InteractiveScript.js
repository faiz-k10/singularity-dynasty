"use client";

import { useEffect } from "react";

export default function InteractiveScript({ tickerPlayers } = {}) {
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

    /* ---- theme toggle ---- */
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) {
      themeToggle.addEventListener(
        "click",
        () => {
          const root = document.documentElement;
          const systemPrefersLight = window.matchMedia(
            "(prefers-color-scheme: light)"
          ).matches;
          const current =
            root.getAttribute("data-theme") ||
            (systemPrefersLight ? "light" : "dark");
          const next = current === "light" ? "dark" : "light";
          root.setAttribute("data-theme", next);
          try {
            localStorage.setItem("theme", next);
          } catch {
            // Safari private mode etc. — theme just won't persist.
          }
        },
        { signal }
      );
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

    /* ---- feed newsletter signup ---- */
    const feedForm = document.getElementById("feedForm");
    if (feedForm) {
      feedForm.addEventListener(
        "submit",
        (e) => {
          e.preventDefault();
          feedForm.classList.add("sent");
        },
        { signal }
      );
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
    const toggle = document.getElementById("billingToggle");
    let annual = false;
    if (toggle) {
      toggle.addEventListener(
        "click",
        () => {
          annual = !annual;
          toggle.classList.toggle("on", annual);
          document.querySelectorAll(".price-amt").forEach((el) => {
            el.textContent = annual
              ? el.dataset.annual
              : el.dataset.monthly;
          });
        },
        { signal }
      );
    }

    /* ---- ticker: RISING / FALLING / STEADY, from real model data ----
       tickerPlayers (passed from the server-rendered homepage) is the
       source of truth: real player names + real trend classifications
       from redraft_rankings. Falls back to a small randomized sample only
       if the prop wasn't provided (e.g. no rankings published yet). */
    const fallbackNames = [
      "CeeDee Lamb",
      "Bijan Robinson",
      "Justin Fields",
      "Marvin Harrison Jr.",
      "Puka Nacua",
      "Najee Harris",
      "Drake Maye",
      "Ja'Marr Chase",
    ];
    const tickerCategories = ["RISING", "FALLING", "STEADY"];
    const track = document.getElementById("tickerTrack");
    // Fisher-Yates -- shuffles display ORDER only, trend values stay real.
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function buildTicker() {
      const items = shuffle(
        tickerPlayers && tickerPlayers.length > 0
          ? tickerPlayers.map((p) => ({ name: p.name, cat: p.trend }))
          : fallbackNames.map((name) => ({
              name,
              cat: tickerCategories[
                Math.floor(Math.random() * tickerCategories.length)
              ],
            }))
      );
      // Original pace was 40s for the 8-name fallback list -- scale the
      // duration with item count so more players (e.g. top 50) doesn't
      // just mean covering more ground in the same 40s (i.e. faster).
      track.style.animationDuration = `${(40 * items.length) / 8}s`;
      let html = "";
      for (let rep = 0; rep < 2; rep++) {
        items.forEach((item) => {
          const arrow =
            item.cat === "RISING" ? "▲" : item.cat === "FALLING" ? "▼" : "—";
          const cls =
            item.cat === "RISING"
              ? "up"
              : item.cat === "FALLING"
              ? "down"
              : "steady";
          html += `<span class="ticker-item">${item.name} <span class="${cls}">${item.cat} ${arrow}</span></span>`;
        });
      }
      track.innerHTML = html;
    }
    if (track) buildTicker();

    /* ---- stripe checkout ---- */
    document.querySelectorAll("[data-plan]").forEach((btn) => {
      btn.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          const plan = btn.getAttribute("data-plan");

          if (plan === "stargazer") {
            alert("Stargazer is free — account creation is coming soon.");
            return;
          }

          const billing = annual ? "annual" : "monthly";
          const originalText = btn.textContent;
          btn.textContent = "Redirecting…";
          btn.style.pointerEvents = "none";

          try {
            const res = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan, billing }),
            });
            const data = await res.json();
            if (!res.ok || !data.url) {
              throw new Error(data.error || "Checkout failed");
            }
            window.location.href = data.url;
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

    /* ---- pricing card tilt + spotlight ---- */
    if (isFinePointer && !reducedMotion) {
      document.querySelectorAll(".round-card").forEach((card) => {
        const featured = card.classList.contains("featured");
        card.addEventListener(
          "mousemove",
          (e) => {
            const rect = card.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width;
            const py = (e.clientY - rect.top) / rect.height;
            const rx = (py - 0.5) * -7;
            const ry = (px - 0.5) * 7;
            card.style.setProperty("--mx", px * 100 + "%");
            card.style.setProperty("--my", py * 100 + "%");
            const base = featured ? "translateY(-8px) " : "";
            card.style.transform = `${base}perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
          },
          { signal }
        );
        card.addEventListener(
          "mouseleave",
          () => {
            card.style.transform = featured ? "translateY(-8px)" : "";
            card.style.removeProperty("--mx");
            card.style.removeProperty("--my");
          },
          { signal }
        );
      });
    }

    /* ---- magnetic buttons ---- */
    function magnetize(el, strength) {
      el.addEventListener(
        "mousemove",
        (e) => {
          const r = el.getBoundingClientRect();
          const x = e.clientX - r.left - r.width / 2;
          const y = e.clientY - r.top - r.height / 2;
          el.style.transform = `translate(${(x / r.width) * strength}px,${
            (y / r.height) * strength
          }px)`;
        },
        { signal }
      );
      el.addEventListener(
        "mouseleave",
        () => {
          el.style.transform = "";
        },
        { signal }
      );
    }
    if (isFinePointer && !reducedMotion) {
      document
        .querySelectorAll(".btn-primary, .btn-ghost")
        .forEach((el) => magnetize(el, 10));
    }

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

    /* ---- click burst: small radial spark burst at any click point ---- */
    function clickBurst(x, y) {
      if (reducedMotion) return;
      const wrap = document.createElement("div");
      wrap.className = "click-burst";
      wrap.style.transform = `translate(${x}px,${y}px)`;
      for (let i = 0; i < 6; i++) {
        const s = document.createElement("span");
        s.style.setProperty("--a", i * 60 + "deg");
        s.style.background =
          i % 2 === 0 ? "var(--horizon-gold)" : "var(--neon-blue)";
        wrap.appendChild(s);
      }
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 520);
    }
    document
      .querySelectorAll(".btn-primary, .btn-ghost, .round-btn, .node, .orbit-dot")
      .forEach((el) => {
        el.addEventListener(
          "click",
          (e) => clickBurst(e.clientX, e.clientY),
          { signal }
        );
      });

    /* ---- draggable hero signal ring ---- */
    const chipsLayer = document.getElementById("osChipsLayer");
    if (chipsLayer) {
      let dragging = false;
      let startAngle = 0;
      let currentRot = 0;
      let startRot = 0;
      function ringAngle(cx, cy, px, py) {
        return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
      }
      function ringCenter() {
        const r = chipsLayer.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      chipsLayer.addEventListener(
        "pointerdown",
        (e) => {
          dragging = true;
          chipsLayer.setPointerCapture(e.pointerId);
          const c = ringCenter();
          startAngle = ringAngle(c.x, c.y, e.clientX, e.clientY);
          startRot = currentRot;
        },
        { signal }
      );
      chipsLayer.addEventListener(
        "pointermove",
        (e) => {
          if (!dragging) return;
          const c = ringCenter();
          const ang = ringAngle(c.x, c.y, e.clientX, e.clientY);
          currentRot = startRot + (ang - startAngle);
          chipsLayer.style.setProperty("--drag-rot", currentRot + "deg");
        },
        { signal }
      );
      ["pointerup", "pointercancel"].forEach((evt) => {
        chipsLayer.addEventListener(
          evt,
          () => {
            dragging = false;
          },
          { signal }
        );
      });
    }

    /* ---- click-and-drag horizontal scroll for wide data tables ---- */
    // The scroll-affordance problem isn't that these tables can't scroll
    // (overflow-x:auto already works) -- it's that nothing signals a
    // desktop mouse user they should try. Trackpad/touch users already
    // discover it naturally via a horizontal swipe; this adds the same
    // grab-and-drag interaction the hero ring above already uses, so a
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
  }, []);

  return null;
}

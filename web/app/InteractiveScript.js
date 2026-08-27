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
    let rafCancelled = false;

    /* ---- scroll to hash on initial load ----
       html{scroll-behavior:smooth} (globals.css) silently breaks the
       browser's native scroll-to-fragment-on-load in some cases, leaving
       the page stuck at the top. Wasn't visible before since every
       top-nav-bar/radial-menu link was same-page-only (#section); now
       they point at /#section and can land here fresh from another page,
       so this needs to be handled explicitly instead of relying on the
       browser's default. "instant" (not "auto") to actually bypass the
       CSS smooth-scroll and match normal anchor-navigation semantics --
       scrollIntoView's "auto" just inherits the CSS scroll-behavior. */
    let landedViaHash = false;
    if (window.location.hash) {
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
    const spySections = ["hero", "tools", "feed", "pricing", "playground"]
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
          // <button>. Skip drag-init on any of these so real clicks work
          // normally; only a press starting on genuinely inert cell
          // content begins a drag.
          if (e.target.closest('a, button, [role="button"]')) return;
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

    /* ---- nav dropdown horizontal positioning (Tools/Pricing) ----
       .nav-dropdown-menu panels are wide (260px+ -- wider still for
       Tools, since "WR/QB Prospect Rankings & Comparisons" uses
       white-space:nowrap and grows the panel past its own min-width) but
       the Tools/Pricing triggers sit only ~75-90px apart depending on
       viewport width -- a plain centered anchor overlaps them by more
       than either panel's own trigger is wide. Whichever dropdown comes
       later in the DOM (Pricing) would win that overlapping region for
       :hover, so moving the cursor from "Tools" into its own panel
       silently activated Pricing's instead.
       Two static CSS-only fixes were tried before this (a full
       edge-anchor, then a fixed guessed offset) -- both broke again
       because the panel's real width varies by content and viewport in
       ways a hardcoded number can't account for. Measuring the ACTUAL
       rendered width here and computing the minimum shift needed is the
       only version of this that stays correct regardless of content
       length or viewport width, instead of another guess to invalidate
       next time either one changes.
       --dd-left / --dd-width are consumed by .nav-dropdown-menu and
       .nav-dropdown::after (globals.css) via CSS custom property
       inheritance -- set once here on the wrapper, both the panel and
       its invisible hover-bridge read the same computed values without
       needing separate JS writes to each. */
    function positionNavDropdowns() {
      const wrappers = [...document.querySelectorAll(".top-nav-bar .nav-dropdown")];
      if (wrappers.length === 0) return;

      // Clear any previous run's adjustment before re-measuring, so a
      // resize doesn't compound shifts from the prior layout.
      wrappers.forEach((w) => {
        w.style.removeProperty("--dd-left");
        w.style.removeProperty("--dd-width");
      });

      const BUFFER = 12;
      const infos = wrappers.map((w) => {
        const menu = w.querySelector(".nav-dropdown-menu");
        const trigger = w.querySelector("a").getBoundingClientRect();
        const wrapperLeft = w.getBoundingClientRect().left;
        const width = menu ? menu.getBoundingClientRect().width : 0;
        const center = trigger.left + trigger.width / 2;
        return { w, menu, width, wrapperLeft, center, left: center - width / 2, right: center + width / 2 };
      });

      // Single left-to-right pass: push any overlapping adjacent pair
      // apart by half the overlap each -- the minimum shift that clears
      // them while staying as close to centered as geometrically
      // possible. Only two dropdowns exist today (Tools, Pricing), so
      // one pass is exact; a third adjacent dropdown later would still
      // get a reasonable (if not perfectly optimal) result from this.
      for (let i = 0; i < infos.length - 1; i++) {
        const a = infos[i];
        const b = infos[i + 1];
        const overlap = a.right + BUFFER - b.left;
        if (overlap > 0) {
          const shift = overlap / 2;
          a.left -= shift;
          a.right -= shift;
          b.left += shift;
          b.right += shift;
        }
      }

      infos.forEach(({ w, menu, left, width, wrapperLeft }) => {
        if (!menu) return;
        w.style.setProperty("--dd-left", `${left - wrapperLeft}px`);
        w.style.setProperty("--dd-width", `${width}px`);
      });
    }
    positionNavDropdowns();
    window.addEventListener("resize", positionNavDropdowns, { signal });
    // Google Fonts can shift text width slightly after first paint even
    // with next/font's optimizations -- re-measure once fonts actually
    // settle so a late metric swap can't leave a stale, slightly-wrong
    // shift in place.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!signal.aborted) positionNavDropdowns();
      });
    }

    /* ---- gravity playground ---- */
    const canvas = document.getElementById("gravityCanvas");
    if (canvas) {
      const frame = canvas.parentElement;
      const ctx = canvas.getContext("2d");
      const counterEl = document.getElementById("collapseCount");
      let count = 0;
      let particles = [];
      const MAX_PARTICLES = 140;
      let W = 0,
        H = 0,
        cx = 0,
        cy = 0;
      const palette = ["#FFC773", "#FF7A45", "#3DDCFF"];
      let pulse = 0;

      const systemLight = window.matchMedia("(prefers-color-scheme: light)");
      function trailColor() {
        const explicit = document.documentElement.getAttribute("data-theme");
        const isLight = explicit ? explicit === "light" : systemLight.matches;
        return isLight ? "rgba(250,248,243,0.28)" : "rgba(16,16,24,0.28)";
      }

      function resize() {
        const rect = frame.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = rect.width;
        H = rect.height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W / 2;
        cy = H / 2;
      }
      resize();
      window.addEventListener("resize", resize, { signal });

      function spawn(x, y) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        const dx = x - cx,
          dy = y - cy;
        const radius = Math.max(Math.sqrt(dx * dx + dy * dy), 15);
        particles.push({
          radius,
          angle: Math.atan2(dy, dx),
          color: palette[Math.floor(Math.random() * palette.length)],
          r: 2 + Math.random() * 1.5,
        });
      }

      function collapse() {
        count++;
        counterEl.textContent = count;
        counterEl.parentElement.classList.add("pop");
        setTimeout(() => counterEl.parentElement.classList.remove("pop"), 180);
        pulse = 1;
      }

      function drawCore(t) {
        const wobble = Math.sin(t / 900) * 1.5;
        const radius = 16 + wobble + pulse * 10;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.2);
        grad.addColorStop(0, "#FFC773");
        grad.addColorStop(0.5, "#FF7A45");
        grad.addColorStop(1, "rgba(61,220,255,0)");
        ctx.save();
        ctx.shadowColor = "rgba(255,122,69,0.6)";
        ctx.shadowBlur = 24 + pulse * 30;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        pulse *= 0.92;
      }

      function tick(t) {
        if (rafCancelled) return;
        ctx.fillStyle = trailColor();
        ctx.fillRect(0, 0, W, H);

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          if (p.radius < 15) {
            particles.splice(i, 1);
            collapse();
            continue;
          }
          p.radius *= 0.965;
          p.angle += 0.11 + 6 / (p.radius + 30);
          const x = cx + p.radius * Math.cos(p.angle);
          const y = cy + p.radius * Math.sin(p.angle);

          ctx.save();
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        drawCore(t);
        requestAnimationFrame(tick);
      }

      function pointerToCanvas(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }
      frame.addEventListener(
        "pointerdown",
        (e) => {
          const pos = pointerToCanvas(e);
          spawn(pos.x, pos.y);
          clickBurst(e.clientX, e.clientY);
        },
        { signal }
      );

      if (reducedMotion) {
        ctx.fillStyle = trailColor();
        ctx.fillRect(0, 0, W, H);
        drawCore(0);
        frame.addEventListener("pointerdown", () => collapse(), { signal });
      } else {
        requestAnimationFrame(tick);
      }
    }

    return () => {
      rafCancelled = true;
      controller.abort();
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return null;
}

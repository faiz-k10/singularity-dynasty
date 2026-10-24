"use client";

import { useEffect } from "react";
import { dragonBallSvg } from "@/lib/dragonBall";

export default function InteractiveScript({ tickerItems } = {}) {
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

    /* ---- ticker: a random assortment of achievement badges ----
       tickerItems (passed from the server-rendered homepage,
       SiteHeader.js) is the source of truth: 50 real {name, key, variant,
       label} picks already randomly sampled server-side from the top 20
       players' FULL achievement set (On Fire/On Thin Ice/Risky Icarus/
       Steady Eddy/Buy Low/Sell High/Super Hero/Honorable/Con Artist -- see
       achievements.js and achievementsData.js). Confidence (Established/Building) is
       deliberately excluded there by request -- it's common enough among
       the top 20 that it drowned out every rarer flag. RISING/FALLING/
       STEADY used to be the whole ticker; that's gone in favor of the
       same badge language the rest of the site uses. Falls back to a
       small made-up sample only if the prop wasn't provided (e.g. no
       rankings published yet). Markup mirrors each badge's real icon
       (the matching *Icon function in WeeklyDetailRow.js) as plain
       strings, since this is vanilla DOM/innerHTML, not React.
       TICKER_ICONS is keyed by the achievement's `key` (confidence/
       volatile/locked/onFire/onIce/hero/honorable/conArtist), NOT its
       `variant` (gold/icarus/eddy/heat/ice/cape/honorable/menace) --
       those two are different fields on the same object (see
       getAchievements() in achievements.js). Keying this by variant name
       was the original bug: "locked" and "volatile" never matched
       anything here, so Steady Eddy and Risky Icarus silently fell back
       to the plain confidence star instead of their own lock/sparkles
       icon. */
    // Each glyph is nudged so its optical centre (the average of its bounding box and its ink centre of mass, measured from
    // a render) sits on the badge's centre: the lock's heavy body made it look low and the sprout's stem pulled it down.
    const TICKER_ICONS = {
      confidence:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.6,1.2)"><path d="M5 2.8a1 1 0 0 1 1 1v16.4a1 1 0 1 1-2 0V3.8a1 1 0 0 1 1-1z"/><path d="M6.6 4.4c2.2-1.25 4.45-1.25 6.65 0s4.45 1.25 6.65 0v8.6c-2.2 1.25-4.45 1.25-6.65 0s-4.45-1.25-6.65 0z"/></g></svg>',
      volatile:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/></svg>',
      locked:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(12 11.55) scale(0.9) translate(-12 -12)"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9zm3 4a1.6 1.6 0 0 1 1 2.85V18a1 1 0 1 1-2 0v-1.15A1.6 1.6 0 0 1 12 14z"/></g></svg>',
      onFire:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0,-0.15)"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133.998a5.27 5.27 0 01-.32-1.83c0-1.014.377-1.94 1-2.647a3.752 3.752 0 014.5 4.65z"/></g></svg>',
      onIce:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M4.8 7.5l14.4 9M4.8 16.5l14.4-9"/><path d="M12 5.2l-1.8 1.5M12 5.2l1.8 1.5M12 18.8l-1.8-1.5M12 18.8l1.8-1.5"/><path d="M6 8.6l-.3 2.1-2 .6M18 15.4l.3-2.1 2-.6"/></svg>',
      buyLow:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.68,-0.57)"><path d="M12 20V11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M12 14.2c-3.6 0-6.2-2.3-6.2-6.5C9.9 8 12 10.4 12 14.2z"/><path d="M12 11.3c2.9 0 5.1-1.9 5.1-5.4C13.9 6 12 8.1 12 11.3z" opacity="0.85"/></g></svg>',
      sellHigh:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.12,0.2)"><g transform="translate(-1.085,-1.115)"><path d="M10.3 4.2c-.5 0-1 .3-1.1.8l-.5 1.7c-2.8 1.1-4.7 3.8-4.7 7 0 4.3 3.9 7.8 9 7.8s9-3.5 9-7.8c0-3.2-1.9-5.9-4.7-7l-.5-1.7c-.1-.5-.6-.8-1.1-.8z"/><g transform="translate(0.8,-0.15)"><path d="M12 8.3v9.4M14.1 10c-.4-.4-1.2-.8-2-.8-1.1 0-2 .6-2 1.6 0 1 1 1.4 2 1.7 1.3.3 2.3.8 2.3 1.9 0 1-.9 1.7-2.1 1.7-.9 0-1.8-.4-2.3-.9" stroke="var(--peak)" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g></g></svg>',
      honorable:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.43,0.18)"><g transform="translate(-0.454,0.974)"><path d="M12 3.2 1.5 8l10.5 4.8L20 9.2v5.4h1.5V8L12 3.2z"/><path d="M5 10.4v4.3c0 1.7 3.1 3.4 7 3.4s7-1.7 7-3.4v-4.3l-7 3.2-7-3.2z" opacity="0.85"/><path d="M18.5 10v6.6" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="18.5" cy="17.6" r="1.1"/></g></g></svg>',
      // Elite Role (framed landscape) and Elite Player (podium): the same art as the opened-player badges, filling the whole 16px medallion. The podium has
      // no digits here: at 16px they are smaller than 4px and would only read as noise.
      eliteRole:
        '<svg viewBox="0 0 24 24"><rect x="4.2" y="6" width="15.6" height="12" rx="1" fill="#E3B341"/><rect x="5.7" y="7.5" width="12.6" height="9" fill="#F7D9A8"/><circle cx="14.9" cy="10.3" r="1.5" fill="#D9480F"/><path d="M5.7 16.5 9.6 10.6 12.6 14.4 14.4 12.6 18.3 16.5Z" fill="#6B3A5B"/><path d="M5.7 16.5C8 14.2 10.6 14.6 12.4 15.6 14.6 14.4 16.6 14.8 18.3 16.5Z" fill="#3F6B4A"/></svg>',
      elitePlayer:
        '<svg viewBox="0 0 30 30"><rect x="11" y="9.5" width="8" height="12.5" fill="#F5C542"/><rect x="3.5" y="13" width="7.5" height="9" fill="#C9D1DC"/><rect x="19" y="15.5" width="7.5" height="6.5" fill="#CD7F32"/><rect x="3.5" y="22" width="23" height="1.2" fill="#E8E6E1"/></svg>',
      conArtist:
        '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(-0.4,0.24)"><path d="M2.245,3.02 C5.71,1.04 9.49,1.04 12.955,3.02 C14.215,9.95 10.3,15.3 7.6,16.29 C4.9,15.3 1.0,9.95 2.245,3.02 Z M5.395,7.31 A0.95,0.95 0 1,0 7.295,7.31 A0.95,0.95 0 1,0 5.395,7.31 Z M8.905,7.31 A0.95,0.95 0 1,0 10.805,7.31 A0.95,0.95 0 1,0 8.905,7.31 Z M4.954,11.27 Q7.6,10.17 10.246,11.27 Q7.6,7.87 4.954,11.27 Z" opacity="0.55" fill-rule="evenodd"/><path d="M6.8 2.9 8.4 2.9 7.6 0.9Z" opacity="0.55"/><path d="M10.19,8.98 C13.82,6.91 17.78,6.91 21.41,8.98 C22.73,16.225 18.5,21.8 15.8,22.435 C13.1,21.8 8.87,16.225 10.19,8.98 Z M13.49,13.465 A1,1 0 1,0 15.49,13.465 A1,1 0 1,0 13.49,13.465 Z M17.11,13.465 A1,1 0 1,0 19.11,13.465 A1,1 0 1,0 17.11,13.465 Z M13.028,17.605 Q15.8,18.705 18.572,17.605 Q15.8,21.205 13.028,17.605 Z" fill-rule="evenodd"/><path d="M15 8.85 16.6 8.85 15.8 6.75Z"/></g></svg>',
    };
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
    const fallbackVariants = [
      { key: "onFire", variant: "heat", label: "On Fire" },
      { key: "onIce", variant: "ice", label: "On Thin Ice" },
      { key: "volatile", variant: "icarus", label: "Risky Icarus" },
      { key: "locked", variant: "eddy", label: "Steady Eddy" },
      { key: "buyLow", variant: "sprout", label: "Buy Low" },
      { key: "sellHigh", variant: "peak", label: "Sell High" },
      { key: "hero", variant: "ball", label: "1x Super Hero", tier: 1 },
      { key: "honorable", variant: "honorable", label: "Honorable" },
      { key: "conArtist", variant: "menace", label: "Con Artist" },
    ];
    const track = document.getElementById("tickerTrack");
    // Fisher-Yates -- shuffles display ORDER only.
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
        tickerItems && tickerItems.length > 0
          ? tickerItems
          : fallbackNames.map((name) => ({
              name,
              ...fallbackVariants[Math.floor(Math.random() * fallbackVariants.length)],
            }))
      );
      // Original pace was 40s for the 8-name fallback list -- scale the
      // duration with item count so more players (e.g. the real 50-item
      // ticker) doesn't just mean covering more ground in the same 40s
      // (i.e. faster).
      track.style.animationDuration = `${(40 * items.length) / 8}s`;
      let html = "";
      for (let rep = 0; rep < 2; rep++) {
        items.forEach((item) => {
          if (item.key === "pace") {
            html += `<span class="ticker-item">${item.name} <span class="ticker-pace ${item.variant}">${item.label}</span></span>`;
            return;
          }
          // One item per player: his name, then every badge he has as an icon only (no text labels). The made-up
          // fallback items carry a single badge in the same shape.
          const badges = item.badges || [{ key: item.key, variant: item.variant }];
          const icons = badges
            .map((b) => `<span class="ticker-badge ${b.variant}">${b.key === "hero" ? dragonBallSvg(b.tier || 1, 16) : TICKER_ICONS[b.key] || TICKER_ICONS.confidence}</span>`)
            .join("");
          html += `<span class="ticker-item">${item.name} <span class="ticker-badges">${icons}</span></span>`;
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
            window.location.href = "/login";
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
    // Mount-once: tickerItems is server-fetched data that's stable for
    // the life of the page, and this effect wires every listener exactly
    // once. Re-running on a prop change would double-bind everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

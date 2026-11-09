"use client";

import { useEffect } from "react";
import { dragonBallSvg } from "@/lib/dragonBall";
import { BADGE_ICONS } from "@/lib/badgeIcons";

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
   BADGE_ICONS is keyed by the achievement's `key` (confidence/
   volatile/locked/onFire/onIce/hero/honorable/conArtist), NOT its
   `variant` (gold/icarus/eddy/heat/ice/cape/honorable/menace) --
   those two are different fields on the same object (see
   getAchievements() in achievements.js). Keying this by variant name
   was the original bug: "locked" and "volatile" never matched
   anything here, so Steady Eddy and Risky Icarus silently fell back
   to the plain confidence star instead of their own lock/sparkles
   icon. */

// Own component (it used to live inside InteractiveScript) so the ticker can stream in AFTER the page: SiteHeader renders it inside a Suspense boundary and
// the nav, menus and every other interaction are live without waiting for the ticker's data.
// Generated for the ticker: every icon is centred on its own ink (70% visual weight, 30% bounding box) and scaled so its farthest point sits the same
// distance from the centre, so all of them sit inside the 16px circle with the same room around them. Regenerate if an icon's art changes.
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
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Text going into the strip's HTML (names come from our own published tables, but nothing reaches innerHTML unescaped).
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Builds the scrolling strip into the track element: items shuffled (display order only), the list written twice so the CSS scroll loops seamlessly.
function buildTicker(track, tickerItems) {
  const items = shuffle(
    tickerItems && tickerItems.length > 0
      ? tickerItems
      : fallbackNames.map((name) => ({
          name,
          ...fallbackVariants[Math.floor(Math.random() * fallbackVariants.length)],
        }))
  );
  // Original pace was 40s for the 8-name fallback list -- scale the duration with item count so more players (e.g. the real 50-item ticker) doesn't
  // just mean covering more ground in the same 40s (i.e. faster).
  track.style.animationDuration = `${(40 * items.length) / 8}s`;
  let html = "";
  for (let rep = 0; rep < 2; rep++) {
    items.forEach((item) => {
      if (item.key === "pace") {
        html += `<span class="ticker-item">${esc(item.name)} <span class="ticker-pace ${esc(item.variant)}">${esc(item.label)}</span></span>`;
        return;
      }
      // One item per player: his name, then every badge he has as an icon only (no text labels). The made-up fallback items carry a single badge in the
      // same shape.
      const badges = item.badges || [{ key: item.key, variant: item.variant }];
      const icons = badges
        .map((b) => `<span class="ticker-badge ${esc(b.variant)}">${b.key === "hero" ? dragonBallSvg(b.tier || 1, 16) : BADGE_ICONS[b.key] || BADGE_ICONS.confidence}</span>`)
        .join("");
      html += `<span class="ticker-item">${esc(item.name)} <span class="ticker-badges">${icons}</span></span>`;
    });
  }
  track.innerHTML = html;
}

// Fills #tickerTrack (the empty bar SiteHeader renders) once on mount with the picks it was given.
export default function TickerTrack({ items }) {
  useEffect(() => {
    const track = document.getElementById("tickerTrack");
    if (track) buildTicker(track, items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

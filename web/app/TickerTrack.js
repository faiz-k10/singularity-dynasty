"use client";

import { useEffect } from "react";
import { dragonBallSvg } from "@/lib/dragonBall";

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

// Own component (it used to live inside InteractiveScript) so the ticker can stream in AFTER the page: SiteHeader renders it inside a Suspense boundary and
// the nav, menus and every other interaction are live without waiting for the ticker's data.
const TICKER_ICONS = {
  confidence:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.6,1.2)"><path d="M5 2.8a1 1 0 0 1 1 1v16.4a1 1 0 1 1-2 0V3.8a1 1 0 0 1 1-1z"/><path d="M6.6 4.4c2.2-1.25 4.45-1.25 6.65 0s4.45 1.25 6.65 0v8.6c-2.2 1.25-4.45 1.25-6.65 0s-4.45-1.25-6.65 0z"/></g></svg>',
  volatile:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="rotate(12 12 12)"><path fill-rule="evenodd" d="M6.9 3.5h10.2a3.4 3.4 0 0 1 3.4 3.4v10.2a3.4 3.4 0 0 1-3.4 3.4H6.9a3.4 3.4 0 0 1-3.4-3.4V6.9a3.4 3.4 0 0 1 3.4-3.4ZM8 6.5a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM16 6.5a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM12 10.45a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM8 14.4a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1ZM16 14.4a1.55 1.55 0 1 0 0 3.1 1.55 1.55 0 0 0 0-3.1Z"/></g></svg>',
  locked:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(12 11.55) scale(0.9) translate(-12 -12)"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9zm3 4a1.6 1.6 0 0 1 1 2.85V18a1 1 0 1 1-2 0v-1.15A1.6 1.6 0 0 1 12 14z"/></g></svg>',
  onFire:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0,-0.15)"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133.998a5.27 5.27 0 01-.32-1.83c0-1.014.377-1.94 1-2.647a3.752 3.752 0 014.5 4.65z"/></g></svg>',
  onIce:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="butt"><g transform="rotate(0 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><g transform="rotate(60 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><g transform="rotate(120 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><g transform="rotate(180 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><g transform="rotate(240 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><g transform="rotate(300 12 12)"><path d="M12 12V4.2" stroke-width="2.2"/><path d="M12 6.9 10 4.9M12 6.9 14 4.9" stroke-width="1.6"/><path d="M12 1.5 13.5 3.7 12 5.9 10.5 3.7Z" fill="currentColor" stroke="none"/></g><path d="M12 9.2l2.3 1.3v3L12 14.8l-2.3-1.3v-3Z" fill="currentColor" stroke="none"/></svg>',
  buyLow:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.68,-0.57)"><path d="M12 20V11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M12 14.2c-3.6 0-6.2-2.3-6.2-6.5C9.9 8 12 10.4 12 14.2z"/><path d="M12 11.3c2.9 0 5.1-1.9 5.1-5.4C13.9 6 12 8.1 12 11.3z" opacity="0.85"/></g></svg>',
  sellHigh:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.12,0.2)"><g transform="translate(-1.085,-1.115)"><path d="M10.3 4.2c-.5 0-1 .3-1.1.8l-.5 1.7c-2.8 1.1-4.7 3.8-4.7 7 0 4.3 3.9 7.8 9 7.8s9-3.5 9-7.8c0-3.2-1.9-5.9-4.7-7l-.5-1.7c-.1-.5-.6-.8-1.1-.8z"/><g transform="translate(0.8,-0.15)"><path d="M12 8.3v9.4M14.1 10c-.4-.4-1.2-.8-2-.8-1.1 0-2 .6-2 1.6 0 1 1 1.4 2 1.7 1.3.3 2.3.8 2.3 1.9 0 1-.9 1.7-2.1 1.7-.9 0-1.8-.4-2.3-.9" stroke="var(--peak)" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g></g></svg>',
  honorable:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0.43,0.18)"><g transform="translate(-0.454,0.974)"><path d="M12 3.2 1.5 8l10.5 4.8L20 9.2v5.4h1.5V8L12 3.2z"/><path d="M5 10.4v4.3c0 1.7 3.1 3.4 7 3.4s7-1.7 7-3.4v-4.3l-7 3.2-7-3.2z" opacity="0.85"/><path d="M18.5 10v6.6" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="18.5" cy="17.6" r="1.1"/></g></g></svg>',
  // Elite Role (luxury mansion) and Elite Player (goat head): the same one-colour art as the opened-player badges.
  rookie:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M10 3.6h4.2v16.8h-3.4V8.2L8 9.7V6.6Z"/></svg>',
  eliteRole:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 3.4 17.9 8.2V9.4H22V20.2H2V9.4H6.1V8.2ZM12 5.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM7.1 10.6h1.3v3.8H7.1ZM15.6 10.6h1.3v3.8h-1.3ZM10.9 19.4V15.9a1.1 1.1 0 0 1 2.2 0v3.5ZM3.2 12h1.6v3H3.2ZM19.2 12h1.6v3h-1.6ZM3.2 16.4h1.6v2.2H3.2ZM19.2 16.4h1.6v2.2h-1.6Z"/><path d="M11.4 3.6 12 1.2 12.6 3.6Z"/><path d="M3.2 7.4h1.4v2.2H3.2Z"/><path d="M19.4 7.4h1.4v2.2h-1.4Z"/><path d="M9.4 20.2h5.2v1.5H9.4Z"/><path d="M10.4 21.7h3.2v1H10.4Z"/></svg>',
  elitePlayer:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.6 9C5.4 9.4 2.4 6.6 2.8 1.6C4.8 4.4 7.6 4.8 11 5.6Z"/><path d="M14.4 9c4.2.4 7.2-2.4 6.8-7.4-2 2.8-4.8 3.2-8.2 4Z"/><path d="M8.4 11 2.4 10C2.6 12.4 4.2 13.8 7 14Z"/><path d="M15.6 11l6-1c-.2 2.4-1.8 3.8-4.6 4Z"/><path fill-rule="evenodd" d="M8.2 8.6h7.6l-.8 7c-.2 1.7-1.3 2.8-3 2.8s-2.8-1.1-3-2.8ZM9.3 11h1.8v1.1H9.3ZM12.9 11h1.8v1.1h-1.8ZM11 15.1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1ZM13 15.1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z"/><path d="M10.6 18.4h2.8L12 22.4Z"/></svg>',
  conArtist:
    '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(-0.4,0.24)"><path d="M2.245,3.02 C5.71,1.04 9.49,1.04 12.955,3.02 C14.215,9.95 10.3,15.3 7.6,16.29 C4.9,15.3 1.0,9.95 2.245,3.02 Z M5.395,7.31 A0.95,0.95 0 1,0 7.295,7.31 A0.95,0.95 0 1,0 5.395,7.31 Z M8.905,7.31 A0.95,0.95 0 1,0 10.805,7.31 A0.95,0.95 0 1,0 8.905,7.31 Z M4.954,11.27 Q7.6,10.17 10.246,11.27 Q7.6,7.87 4.954,11.27 Z" opacity="0.55" fill-rule="evenodd"/><path d="M6.8 2.9 8.4 2.9 7.6 0.9Z" opacity="0.55"/><path d="M10.19,8.98 C13.82,6.91 17.78,6.91 21.41,8.98 C22.73,16.225 18.5,21.8 15.8,22.435 C13.1,21.8 8.87,16.225 10.19,8.98 Z M13.49,13.465 A1,1 0 1,0 15.49,13.465 A1,1 0 1,0 13.49,13.465 Z M17.11,13.465 A1,1 0 1,0 19.11,13.465 A1,1 0 1,0 17.11,13.465 Z M13.028,17.605 Q15.8,18.705 18.572,17.605 Q15.8,21.205 13.028,17.605 Z" fill-rule="evenodd"/><path d="M15 8.85 16.6 8.85 15.8 6.75Z"/></g></svg>',
};
// Where each icon's drawn pixels actually sit, measured from a render (offset of the drawing's bounding-box centre from the 24x24 centre, in
// icon units). Shifting the viewBox by it centres every glyph in its medallion, whatever the art's own padding is.
const ICON_OFFSET = {
  confidence: [0.5, 1.15],
  locked: [0, -0.5],
  onFire: [0, -0.35],
  buyLow: [0, 0.8],
  honorable: [-0.55, 0],
  rookie: [-0.95, 0],
  conArtist: [-0.6, -0.1],
};
function tickerIcon(key) {
  const svg = TICKER_ICONS[key] || TICKER_ICONS.confidence;
  const [dx, dy] = ICON_OFFSET[key] || [0, 0];
  return dx || dy ? svg.replace('viewBox="0 0 24 24"', `viewBox="${dx} ${dy} 24 24"`) : svg;
}
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
        html += `<span class="ticker-item">${item.name} <span class="ticker-pace ${item.variant}">${item.label}</span></span>`;
        return;
      }
      // One item per player: his name, then every badge he has as an icon only (no text labels). The made-up fallback items carry a single badge in the
      // same shape.
      const badges = item.badges || [{ key: item.key, variant: item.variant }];
      const icons = badges
        .map((b) => `<span class="ticker-badge ${b.variant}">${b.key === "hero" ? dragonBallSvg(b.tier || 1, 16) : tickerIcon(b.key)}</span>`)
        .join("");
      html += `<span class="ticker-item">${item.name} <span class="ticker-badges">${icons}</span></span>`;
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

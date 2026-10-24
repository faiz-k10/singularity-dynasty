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
  // Elite Role (framed landscape) and Elite Player (podium): the same one-colour art as the opened-player badges. The podium has no digits here: at 16px they are
  // smaller than 4px and would only read as noise.
  eliteRole:
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.6" y="5.6" width="16.8" height="12.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15.6" cy="10.2" r="1.7"/><path d="M6 16.6 10 10.4 13 14.5 14.8 12.7 18 16.6Z"/></svg>',
  elitePlayer:
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="8.7" y="6.3" width="6.6" height="13.2"/><rect x="2" y="10.3" width="6.7" height="9.2"/><rect x="15.3" y="13.5" width="6.7" height="6"/></svg>',
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
        .map((b) => `<span class="ticker-badge ${b.variant}">${b.key === "hero" ? dragonBallSvg(b.tier || 1, 16) : TICKER_ICONS[b.key] || TICKER_ICONS.confidence}</span>`)
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

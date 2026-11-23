"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ShareDialog from "./ShareDialog";
import { snapshotPng, toShareCard, uploadShare, blockRects, unionRect, warmShare } from "./snapshot";

// "Share" on a player's dashboard (founder, Nov 17 2026: "make it so the shared product shows the player's dashboard and not just a simple
// truncated version"): the dashboard the button sits in (the nearest ancestor matching `target`) is pictured exactly as it is on screen, put on
// a link-preview card under a branded strip (`heading`), uploaded (app/api/lab-share -> /s/<id>, whose preview IS the picture) and handed to
// the usual Share to social pop-up. It pictures what the viewer can already see, so it can never show more than their plan allows.
// The button itself is left out of the picture. `blocks`: for a tall dashboard, the sections to lay out in columns;
// `only`: crop the picture to the region these cover (app/snapshot.js).
export default function DashboardShareButton({ target, blocks, only, title, caption, heading, file = "dynasty-singularity", label = "Share", className = "lab-copy" }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const urls = useRef([]);
  useEffect(() => warmShare(btn.current?.closest(target)), [target]);
  const close = useCallback(() => {
    setOpen(false);
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current = [];
  }, []);
  const prepare = useCallback(
    async ({ onPreview }) => {
      const el = btn.current?.closest(target);
      if (!el) throw new Error("Couldn't find the dashboard to share.");
      // measured before the picture is drawn, from the page as it is
      const parts = only ? unionRect(el, only) : blocks ? blockRects(el, blocks) : null;
      const shot = await snapshotPng(el);
      const card = await toShareCard(shot, { right: heading }, parts, { type: "image/jpeg" });
      const preview = URL.createObjectURL(card), full = URL.createObjectURL(shot);
      urls.current.push(preview, full);
      onPreview(preview);
      const url = await uploadShare(card, { title, caption, view: window.location.pathname });
      return {
        url,
        getFile: async () => (only ? new File([card], `${file}.jpg`, { type: "image/jpeg" }) : new File([shot], `${file}.png`, { type: "image/png" })),
        downloads: [
          ...(only ? [] : [{ label: "Download the dashboard (full size)", href: full, download: `${file}.png` }]),
          { label: "Download the link-preview card", href: preview, download: `${file}-card.jpg` },
        ],
      };
    },
    [target, blocks, only, title, caption, heading, file]
  );
  return (
    <>
      <button type="button" ref={btn} className={`share-card-btn ${className}`} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M8 2v8M4.5 5.5 8 2l3.5 3.5M3 9v4h10V9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && <ShareDialog prepare={prepare} caption={caption} onClose={close} />}
    </>
  );
}

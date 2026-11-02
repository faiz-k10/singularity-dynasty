"use client";

import { useCallback, useState } from "react";
import ShareDialog from "./ShareDialog";

// A "Share" button for any share card: asks /api/card for the link (signed, with the viewer's referral code), shows the card, and opens the
// usual Share to social pop-up. `card` is the request body (see app/api/card/route.js); `caption` the post's starting text; `file` the
// download's base name.
export default function ShareCardButton({ card, caption, file = "singularity-card", label = "Share", className = "lab-copy" }) {
  const [open, setOpen] = useState(false);
  const body = JSON.stringify(card);
  const prepare = useCallback(
    async ({ onPreview }) => {
      const res = await fetch("/api/card", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't make the card.");
      onPreview(data.image);
      return {
        url: data.url,
        caption: data.caption,
        // the phone share sheet gets the Instagram-shaped picture
        getFile: async () => {
          const r = await fetch(data.tall);
          if (!r.ok) throw new Error("no picture");
          return new File([await r.blob()], `${file}.png`, { type: "image/png" });
        },
        downloads: [
          { label: "Download for Instagram (1080 × 1350)", href: `${data.tall}&dl=${encodeURIComponent(file)}` },
          { label: "Download wide (1200 × 630)", href: `${data.image}?dl=${encodeURIComponent(file)}` },
        ],
      };
    },
    [body, file]
  );
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={`share-card-btn ${className}`} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M8 2v8M4.5 5.5 8 2l3.5 3.5M3 9v4h10V9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && <ShareDialog prepare={prepare} caption={caption} onClose={close} />}
    </>
  );
}

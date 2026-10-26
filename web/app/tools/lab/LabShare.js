"use client";

import { useEffect, useRef, useState } from "react";
import { SHARE_W, SHARE_H, composeUrl } from "@/lib/labShare";

// The Share to social pop-up (opened from LabExport). When it opens, the chart is drawn (with the watermark), fitted into a link-preview card and
// turned into a share link, /s/<id> (app/api/lab-share), whose preview IS the chart. Then each button opens that platform with the post already
// written -- caption, link, and the chart showing as the link's preview -- so all that's left is to press Post:
//   X, Threads, Bluesky, Facebook, LinkedIn, Reddit   their own "compose a post" pages
//   Discord     copies the caption + link and opens Discord: pasted into any channel, the chart shows under it (Discord has no compose link)
//   Instagram / TikTok   neither takes a post from a website at all; on a phone the button hands the chart to the app through the share sheet
// The link is made once per opening and reused by every button. Nothing is downloaded. The picture is usually already drawn (LabExport starts it when
// the Export menu opens) and is previewed at once; the buttons wake up when the share link is ready (a second or so later).

const isTouch = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

// The chart centred on a 1.91 : 1 card in the page's own background colour: the shape every platform uses for a large link preview, so none of them
// crops the chart.
async function toCard(blob) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  const pad = 40;
  const s = Math.min((SHARE_W - 2 * pad) / img.width, (SHARE_H - 2 * pad) / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (SHARE_W - w) / 2, (SHARE_H - h) / 2, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no card"))), "image/png"));
}

const ICONS = {
  x: <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />,
  threads: (
    <path d="M12.2 2.5c-5.6 0-9.2 3.7-9.2 9.5s3.6 9.5 9.2 9.5c3.9 0 6.9-2 8.1-5.3l-2.3-.8c-.9 2.4-3 3.7-5.8 3.7-4.2 0-6.7-2.8-6.7-7.1s2.5-7.1 6.7-7.1c3.6 0 5.8 1.9 6.4 5.2-.9-.3-1.9-.4-3-.4-3.5 0-5.6 1.6-5.6 4 0 2.2 1.9 3.7 4.3 3.7 3 0 4.8-2 5-5.5l.1-1.3c-.3-4.5-3.2-7.4-7.2-7.4Zm2.2 13c-1.2 0-1.9-.6-1.9-1.4 0-1 1-1.6 3-1.6.6 0 1.2.1 1.8.2-.2 1.9-1.2 2.8-2.9 2.8Z" />
  ),
  bluesky: (
    <path d="M6.3 4.2C8.6 5.9 11.1 9.4 12 11.3c.9-1.9 3.4-5.4 5.7-7.1 1.7-1.2 4.3-2.2 4.3.8 0 .6-.3 5-.5 5.7-.7 2.5-3.2 3.1-5.5 2.7 4 .7 5 2.9 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5l-.3-.8-.3.8c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.3-1.2-4.5 2.8-5.2-2.3.4-4.8-.2-5.5-2.7C2.3 10 2 5.6 2 5c0-3 2.6-2 4.3-.8Z" />
  ),
  facebook: <path d="M14 8.5V6.8c0-.8.5-1.3 1.4-1.3H17V2.2h-2.6C11.7 2.2 10.3 4 10.3 6.6v1.9H8v3.3h2.3V22h3.7V11.8h2.6l.4-3.3H14Z" />,
  linkedin: (
    <path d="M4.5 8.5h3.4V20H4.5V8.5Zm1.7-5.3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm3.8 5.3h3.3v1.6c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.4V20h-3.4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 2.9V20H10V8.5Z" />
  ),
  reddit: (
    <path d="M22 12.2a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.7-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-1l-3.6-.8a.5.5 0 0 0-.6.4l-1.1 5.3a10.8 10.8 0 0 0-5.8 1.8 2.2 2.2 0 1 0-2.4 3.6v.6c0 3.3 3.9 6 8.6 6s8.6-2.7 8.6-6v-.6a2.2 2.2 0 0 0 1.3-2ZM7.6 13.8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm8.3 4a5.4 5.4 0 0 1-3.9 1.2 5.4 5.4 0 0 1-3.9-1.2.4.4 0 0 1 .6-.6 4.7 4.7 0 0 0 3.3 1 4.7 4.7 0 0 0 3.3-1 .4.4 0 0 1 .6.6Zm-.3-2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
  ),
  discord: (
    <path d="M19.6 5.3A16.5 16.5 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7a16.6 16.6 0 0 0 5 2.6l1.1-1.7a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.8 11.8 0 0 0 11.6 0l.4.3a10.7 10.7 0 0 1-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.6c.4-4.3-.6-8.1-2.9-11.4ZM8.4 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  ),
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  tiktok: <path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.4 1.3V6.6a4.5 4.5 0 0 1-4.4-4.6Z" />,
};
const NAMES = { x: "X", threads: "Threads", bluesky: "Bluesky", facebook: "Facebook", linkedin: "LinkedIn", reddit: "Reddit", discord: "Discord", instagram: "Instagram", tiktok: "TikTok" };
const COMPOSE = ["x", "threads", "bluesky", "facebook", "linkedin", "reddit"];

export default function LabShare({ render, title, caption, onClose }) {
  const [share, setShare] = useState(null); // { url, chart (Blob), preview (object URL) }
  const [failed, setFailed] = useState(null);
  const [text, setText] = useState(caption);
  const [note, setNote] = useState(null);
  const dialogRef = useRef(null);
  const sheet = isTouch() && typeof navigator.canShare === "function";

  // Draw the chart (or take the one LabExport already drew), make its card, show it, then make the share link -- once per opening.
  useEffect(() => {
    let alive = true;
    let preview = null;
    (async () => {
      const chart = await render();
      const card = await toCard(chart);
      if (!alive) return;
      preview = URL.createObjectURL(card);
      setShare({ url: null, chart, preview }); // the preview shows now; the buttons wait for the link
      const form = new FormData();
      form.append("image", card, "chart.png");
      form.append("title", title);
      form.append("caption", caption);
      form.append("view", `${window.location.pathname}${window.location.search}`);
      const res = await fetch("/api/lab-share", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't create the share link.");
      if (alive) setShare((cur) => ({ ...cur, url: body.url }));
    })().catch((e) => {
      if (!alive) return;
      setFailed(e.message || "Couldn't prepare the post.");
      setNote(`${e.message || "Couldn't prepare the post."} Close this and try again.`);
    });
    return () => {
      alive = false;
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [render, title, caption]);

  // Escape closes; focus moves into the pop-up while it is open and back to the page after.
  useEffect(() => {
    const before = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const copy = async (value, done, failed = "Couldn't copy here: select the link below and copy it by hand.") => {
    try {
      await navigator.clipboard.writeText(value);
      setNote(done);
      return true;
    } catch {
      setNote(failed);
      return false;
    }
  };

  // X, Threads, Bluesky, Facebook, LinkedIn, Reddit and Discord are BUTTONS that open the page from the click itself. (They were links for a while,
  // but ad / privacy blockers hide any link that points at a share page -- twitter.com/intent, facebook.com/sharer, ... -- so for some people the
  // buttons simply weren't there; a button with no address in the page can't be matched.) The window is opened straight inside the click, before
  // anything else happens, which is what pop-up blockers allow; if one blocks it anyway, the address is copied and the note says so.
  const hrefFor = (key) => {
    if (!share?.url) return null;
    if (COMPOSE.includes(key)) return composeUrl(key, { url: share.url, text });
    return key === "discord" ? "https://discord.com/app" : null;
  };
  const openPost = (key) => {
    const href = hrefFor(key);
    if (!href) return;
    const w = window.open(href, "_blank");
    if (w) w.opener = null;
    if (key === "discord") copy(`${text} ${share.url}`, "Caption and link copied. Paste them into any Discord channel: the chart shows right under the link.");
    else if (w) setNote(`${NAMES[key]} opened in a new tab with your post written and the chart as its preview. Just press Post.`);
    else
      copy(
        href,
        `Your browser blocked the new tab, so the ${NAMES[key]} post link was copied: paste it into the address bar.`,
        `Your browser blocked the new tab. Allow pop-ups for this site (the icon in the address bar), then click ${NAMES[key]} again.`
      );
  };
  // Instagram / TikTok on a phone: the share sheet hands the chart to the app.
  const sendToApp = async (key) => {
    if (!share?.url || !sheet) return;
    try {
      await navigator.share({ files: [new File([share.chart], "singularity-lab-chart.png", { type: "image/png" })], text: `${text} ${share.url}` });
    } catch (e) {
      if (e?.name !== "AbortError") setNote(`Couldn't open the share sheet. Copy the link below and post it on ${NAMES[key]}.`);
    }
  };

  const describe = (key) => {
    if (COMPOSE.includes(key)) return "Opens a ready post: just press Post";
    if (key === "discord") return "Copies the post, opens Discord";
    return sheet ? `Sends the chart to the ${NAMES[key]} app` : "On your phone: sends the chart to the app";
  };
  const enabled = (key) => Boolean(share?.url) && (COMPOSE.includes(key) || key === "discord" || sheet);

  return (
    <div className="lab-share-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lab-share glass-panel" role="dialog" aria-modal="true" aria-labelledby="lab-share-title" tabIndex={-1} ref={dialogRef}>
        <div className="lab-share-head">
          <h2 id="lab-share-title">Share to social</h2>
          <button type="button" className="lab-chip-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="lab-share-preview">
          {share ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the card just drawn */
            <img src={share.preview} alt="The chart as it will appear in the post" />
          ) : (
            <span>{failed || "Preparing your post…"}</span>
          )}
        </div>

        <div className="lab-share-grid">
          {Object.keys(NAMES).map((key) => (
            <button key={key} type="button" className={`lab-share-btn is-${key}`} disabled={!enabled(key)} onClick={() => (hrefFor(key) ? openPost(key) : sendToApp(key))}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                {ICONS[key]}
              </svg>
              <b>{NAMES[key]}</b>
              <span>{describe(key)}</span>
            </button>
          ))}
        </div>
        {note && (
          <p className="lab-share-note" role="status">
            {note}
          </p>
        )}

        <label className="lab-field lab-share-caption">
          <span className="lab-field-label">Caption</span>
          <textarea className="lab-select" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="lab-share-foot">
          <span className="lab-share-link" title={share?.url}>
            {share?.url || (failed ? "" : "Making the link…")}
          </span>
          <button type="button" className="lab-copy" disabled={!share?.url} onClick={() => copy(`${text} ${share.url}`, "Caption and link copied.")}>
            Copy caption + link
          </button>
        </div>
      </div>
    </div>
  );
}

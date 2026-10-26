"use client";

import { useEffect, useRef, useState } from "react";

// The Share to social pop-up (opened from LabExport). No site can attach a picture to a post on X, Instagram, TikTok or Discord for you,
// so each button does the most that a browser allows, in one click:
//   X        copies the picture, opens a post with the caption and link filled in -- paste the picture in (Cmd / Ctrl + V)
//   Discord  copies the picture and the caption, opens Discord -- paste into any channel
//   Instagram / TikTok  save the picture and open their upload page (on a phone: the phone's share sheet, where both apps are)
// The picture is drawn once when the pop-up opens (shown as a preview) and reused by every button.

const IS_TOUCH = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

const ICONS = {
  x: (
    <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" fill="currentColor" />
  ),
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  tiktok: (
    <path d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.4 1.3V6.6a4.5 4.5 0 0 1-4.4-4.6Z" fill="currentColor" />
  ),
  discord: (
    <path d="M19.6 5.3A16.5 16.5 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7a16.6 16.6 0 0 0 5 2.6l1.1-1.7a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.8 11.8 0 0 0 11.6 0l.4.3a10.7 10.7 0 0 1-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.6c.4-4.3-.6-8.1-2.9-11.4ZM8.4 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" fill="currentColor" />
  ),
};

export default function LabShare({ render, fileName, caption, onClose }) {
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState(caption);
  const [note, setNote] = useState(null); // { platform, text }
  const dialogRef = useRef(null);
  const link = typeof window !== "undefined" ? window.location.href : "";

  // Draw the picture once.
  useEffect(() => {
    let alive = true;
    let url = null;
    render()
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setPreview(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [render]);

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

  const file = () => new File([blob], `${fileName}.png`, { type: "image/png" });
  const fullText = `${text}\n${link}`;
  const canShareFile = () => Boolean(blob && navigator.canShare?.({ files: [file()] }));
  const save = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyPicture = async (withText) => {
    const items = { "image/png": blob };
    if (withText) items["text/plain"] = new Blob([fullText], { type: "text/plain" });
    try {
      await navigator.clipboard.write([new window.ClipboardItem(items)]);
      return true;
    } catch {
      // Some browsers take only one kind at a time: the picture matters most.
      if (!withText) return false;
      return copyPicture(false);
    }
  };
  const open = (url) => window.open(url, "_blank", "noopener,noreferrer");
  // Phones: the share sheet hands the picture and caption straight to the app.
  const shareSheet = async () => {
    try {
      await navigator.share({ files: [file()], text: fullText });
      return true;
    } catch (e) {
      return e?.name === "AbortError"; // the viewer closed the sheet: nothing to fall back to
    }
  };

  const actions = {
    x: async () => {
      const copied = await copyPicture(false);
      open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`);
      setNote({ platform: "x", text: copied ? "Picture copied. In the post that just opened, paste it in (⌘V / Ctrl+V)." : "Couldn't copy the picture here, so it was saved: add it to the post from your downloads." });
      if (!copied) save();
    },
    discord: async () => {
      const copied = await copyPicture(true);
      open("https://discord.com/app");
      setNote({ platform: "discord", text: copied ? "Picture copied. Paste it into any channel (⌘V / Ctrl+V) and add the caption." : "Couldn't copy the picture here, so it was saved: drag it into a channel." });
      if (!copied) save();
    },
    instagram: async () => {
      if (IS_TOUCH() && canShareFile() && (await shareSheet())) return;
      save();
      open("https://www.instagram.com/");
      setNote({ platform: "instagram", text: "Picture saved. On Instagram choose Create (+), then pick it from your downloads. The caption is ready to copy below." });
    },
    tiktok: async () => {
      if (IS_TOUCH() && canShareFile() && (await shareSheet())) return;
      save();
      open("https://www.tiktok.com/upload");
      setNote({ platform: "tiktok", text: "Picture saved. TikTok's upload page is open: add it from your downloads as a photo post. The caption is ready to copy below." });
    },
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setNote({ platform: null, text: "Caption and link copied." });
    } catch {
      setNote({ platform: null, text: "Couldn't copy: select the caption and copy it by hand." });
    }
  };

  // On a phone with a share sheet, Instagram and TikTok go through it (the pop-up only exists in the browser, so this can read the device).
  const sheet = IS_TOUCH() && typeof navigator.canShare === "function";
  const PLATFORMS = [
    ["x", "X / Twitter", "Copies the picture, opens a post"],
    ["instagram", "Instagram", sheet ? "Sends the picture to the Instagram app" : "Saves the picture, opens Instagram"],
    ["tiktok", "TikTok", sheet ? "Sends the picture to the TikTok app" : "Saves the picture, opens TikTok upload"],
    ["discord", "Discord", "Copies the picture, opens Discord"],
  ];

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
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the picture just drawn */
            <img src={preview} alt="The chart as it will be shared" />
          ) : (
            <span>{failed ? "Couldn't draw the picture. Try Save image in the Export menu." : "Drawing the picture…"}</span>
          )}
        </div>

        <div className="lab-share-grid">
          {PLATFORMS.map(([key, name, does]) => (
            <button key={key} type="button" className={`lab-share-btn is-${key}`} disabled={!blob} onClick={actions[key]}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                {ICONS[key]}
              </svg>
              <b>{name}</b>
              <span>{does}</span>
            </button>
          ))}
        </div>
        {note && (
          <p className="lab-share-note" role="status">
            {note.text}
          </p>
        )}

        <label className="lab-field lab-share-caption">
          <span className="lab-field-label">Caption</span>
          <textarea className="lab-select" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="lab-share-foot">
          <span className="lab-share-link" title={link}>
            {link}
          </span>
          <button type="button" className="lab-copy" onClick={copyCaption}>
            Copy caption + link
          </button>
        </div>
      </div>
    </div>
  );
}

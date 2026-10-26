"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LabShare from "./LabShare";

let fontCss = null; // the page's fonts as embeddable CSS, worked out once per visit (the slow part of the first export)

// The current view as a PNG: the stage (`stageRef`) with its export header and watermark shown and the pickers, notes, hover card and remove
// buttons hidden (all by `.is-exporting` in the CSS, so the layout closes up around what is left out), at twice the screen's pixels, on
// the page's own background so it matches the theme. html-to-image is loaded only when someone exports.
async function renderPng(stage) {
  const { toBlob, getFontEmbedCSS } = await import("html-to-image");
  stage.classList.add("is-exporting");
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    fontCss ??= await getFontEmbedCSS(stage);
    const blob = await toBlob(stage, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      fontEmbedCSS: fontCss,
      width: Math.max(stage.scrollWidth, stage.offsetWidth),
      style: { margin: "0" },
    });
    if (!blob) throw new Error("no image");
    return blob;
  } finally {
    stage.classList.remove("is-exporting");
  }
}

// The Export menu in The Lab's top bar: copy a link to exactly this view, copy the view as an image, save it as a PNG, or share it to social
// (the LabShare pop-up). Closes on an outside click or Escape; the button says what happened for a moment afterwards.
export default function LabExport({ stageRef, fileName, title, caption }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // { text, tone }
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const [sharing, setSharing] = useState(false);
  const renderStage = useCallback(() => renderPng(stageRef.current), [stageRef]);
  const closeShare = useCallback(() => setSharing(false), []);
  const canCopyImage = typeof window !== "undefined" && typeof window.ClipboardItem === "function" && Boolean(navigator.clipboard?.write);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const say = (text, tone = "ok") => {
    setStatus({ text, tone });
    setTimeout(() => setStatus(null), 2200);
  };

  const run = async (job, done, failed) => {
    setOpen(false);
    setBusy(true);
    try {
      await job();
      say(done);
    } catch {
      say(failed, "bad");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => run(() => navigator.clipboard.writeText(window.location.href), "Link copied", "Couldn't copy the link");
  // The clipboard item is created right away, inside the click, with the picture still being drawn: Safari only allows a clipboard write
  // that starts in the click itself.
  const copyImage = () =>
    run(() => navigator.clipboard.write([new window.ClipboardItem({ "image/png": renderPng(stageRef.current) })]), "Image copied", "Couldn't copy: try Save image");
  const saveImage = () =>
    run(
      async () => {
        const url = URL.createObjectURL(await renderPng(stageRef.current));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "Image saved",
      "Couldn't save the image"
    );

  return (
    <div className="lab-export" ref={ref}>
      <button
        type="button"
        className={`lab-copy${status ? ` is-${status.tone}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? "Exporting…" : status ? status.text : "Export"}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="lab-export-menu" role="menu">
          <button type="button" role="menuitem" onClick={copyLink}>
            <b>Copy link</b>
            <span>A link that opens exactly this view</span>
          </button>
          <button type="button" role="menuitem" onClick={copyImage} disabled={!canCopyImage}>
            <b>Copy image</b>
            <span>{canCopyImage ? "Paste the chart anywhere" : "This browser can't copy images: use Save"}</span>
          </button>
          <button type="button" role="menuitem" onClick={saveImage}>
            <b>Save image</b>
            <span>Download it as a PNG</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="lab-export-social"
            onClick={() => {
              setOpen(false);
              setSharing(true);
            }}
          >
            <b>Share to social…</b>
            <span>A ready post on X, Threads, Discord and more</span>
          </button>
        </div>
      )}
      {sharing && <LabShare render={renderStage} title={title} caption={caption} onClose={closeShare} />}
    </div>
  );
}

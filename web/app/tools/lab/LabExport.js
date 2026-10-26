"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LabShare from "./LabShare";

let fontCss = null; // the page's fonts as embeddable CSS, worked out once per visit (the slow part of the first export)

// The library and the font CSS are the heavy first-time costs (a chunk download + parse, then every font file fetched and base64'd). They are
// fetched when the browser is idle after The Lab loads, so opening the menu never has to do them while the pointer is on it.
const loadLib = () => import("html-to-image");
async function warmFonts(stage) {
  if (fontCss || !stage) return;
  const { getFontEmbedCSS } = await loadLib();
  fontCss ??= await getFontEmbedCSS(stage);
}

// The current view as a PNG: a COPY of the stage (`stage`) drawn off screen with its export header and watermark shown and the pickers, notes,
// hover card and remove buttons hidden (all by `.is-exporting` in the CSS, so the layout closes up around what is left out), at twice the
// screen's pixels, on the page's own background so it matches the theme. Drawing a copy means the page itself never flickers into its export
// layout, which is also what lets the picture be drawn in the background before anyone asks for it. html-to-image is loaded when the browser is idle.
async function renderPng(stage) {
  const { toBlob, getFontEmbedCSS } = await loadLib();
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = `position:fixed; left:-100000px; top:0; width:${stage.offsetWidth}px; pointer-events:none;`;
  const copy = stage.cloneNode(true);
  copy.classList.add("is-exporting");
  holder.appendChild(copy);
  document.body.appendChild(holder);
  try {
    fontCss ??= await getFontEmbedCSS(copy);
    const blob = await toBlob(copy, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      fontEmbedCSS: fontCss,
      width: Math.max(copy.scrollWidth, copy.offsetWidth),
      style: { margin: "0" },
    });
    if (!blob) throw new Error("no image");
    return blob;
  } finally {
    holder.remove();
  }
}

// One picture per view, drawn only when an action needs it (Copy image / Save image / Share) and reused until something about the view
// changes -- the address (the Lab mirrors every choice into it), the theme or the window's width. A failed draw is forgotten so the next
// try starts again. Drawing blocks the page for about half a second (html-to-image copies the style of every node; a scatter has
// hundreds), so it never starts ahead of time -- an earlier version drew while the pointer approached the Export button or the menu
// opened, and the first click then waited behind it -- and it first lets the page paint (menu closed, "Exporting…" showing) so the
// block never lands on a control that looks dead.
const pictureCache = { key: null, promise: null };
function pictureKey(stage) {
  return `${window.location.search}|${document.documentElement.getAttribute("data-theme") || ""}|${stage.offsetWidth}`;
}
function getPicture(stage) {
  const key = pictureKey(stage);
  if (pictureCache.key !== key || !pictureCache.promise) {
    pictureCache.key = key;
    pictureCache.promise = new Promise((r) => setTimeout(r, 60)).then(() => renderPng(stage)).catch((e) => {
      if (pictureCache.key === key) pictureCache.promise = null;
      throw e;
    });
  }
  return pictureCache.promise;
}

// The Export menu in The Lab's top bar: copy a link to exactly this view, copy the view as an image, save it as a PNG, or share it to social
// (the LabShare pop-up). Closes on an outside click or Escape; the button says what happened for a moment afterwards.
export default function LabExport({ stageRef, fileName, title, caption }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // { text, tone }
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const [sharing, setSharing] = useState(false);
  const renderStage = useCallback(() => getPicture(stageRef.current), [stageRef]);
  const closeShare = useCallback(() => setSharing(false), []);
  const canCopyImage = typeof window !== "undefined" && typeof window.ClipboardItem === "function" && Boolean(navigator.clipboard?.write);

  // Idle after load: fetch the library and fonts so the first Export click finds them ready.
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => warmFonts(stageRef.current).catch(() => {}), { timeout: 4000 });
    return () => cancel(id);
  }, [stageRef]);

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
    run(() => navigator.clipboard.write([new window.ClipboardItem({ "image/png": getPicture(stageRef.current) })]), "Image copied", "Couldn't copy: try Save image");
  const saveImage = () =>
    run(
      async () => {
        const url = URL.createObjectURL(await getPicture(stageRef.current));
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

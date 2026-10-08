"use client";

import { useEffect, useRef } from "react";

// Site-wide hover tips in the site's own glass style, replacing the browser's plain
// native tooltip. It works off the `title` attribute every component already sets: while a tip
// is showing, the attribute is lifted off the element (so the browser's own box can't appear)
// and put back when the tip hides, so markup, React and screen readers are unaffected.
// Mouse and keyboard focus only; touch has no hover.
export default function Tooltip() {
  const ref = useRef(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    let cur = null; // element whose title is lifted
    let saved = null;
    let timer = null;

    function hide() {
      clearTimeout(timer);
      if (cur) {
        if (saved != null) cur.setAttribute("title", saved);
        cur.removeAttribute("aria-describedby");
      }
      cur = null;
      saved = null;
      tip.dataset.open = "0";
    }

    function place(el, text) {
      if (cur !== el || !el.isConnected) return;
      tip.textContent = text;
      tip.style.left = "0px";
      tip.style.top = "0px";
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      let x = r.left + r.width / 2 - t.width / 2;
      x = Math.max(8, Math.min(x, vw - t.width - 8));
      let y = r.top - t.height - 10;
      let side = "top";
      if (y < 8) {
        y = r.bottom + 10;
        side = "bottom";
      }
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;
      tip.dataset.side = side;
      tip.dataset.open = "1";
      el.setAttribute("aria-describedby", tip.id);
    }

    function start(el, delay) {
      if (el === cur) return;
      hide();
      const text = el.getAttribute("title");
      if (!text || !text.trim()) return;
      cur = el;
      saved = text;
      el.removeAttribute("title");
      timer = setTimeout(() => place(el, text), delay);
    }

    const onOver = (e) => {
      if (e.pointerType === "touch") return;
      const el = e.target.closest?.("[title]");
      if (el) start(el, 220);
    };
    const onOut = (e) => {
      if (cur && !cur.contains(e.relatedTarget)) hide();
    };
    const onFocus = (e) => {
      const el = e.target.closest?.("[title]");
      if (el) start(el, 0);
    };
    const onMove = () => {
      if (cur && !cur.isConnected) hide(); // the element was re-rendered away under the pointer
    };
    const onKey = (e) => e.key === "Escape" && hide();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("scroll", hide, { capture: true, passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("scroll", hide, { capture: true });
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, []);

  return <div ref={ref} id="site-tip" className="site-tip" role="tooltip" data-open="0" />;
}

"use client";

import { useEffect } from "react";

// Keeps Tab / Shift+Tab inside a modal dialog while it is open (WAI-ARIA dialog pattern): from the last focusable element
// Tab wraps to the first, and Shift+Tab from the first wraps to the last, so keyboard and screen-reader users can't wander
// into the page behind it. The dialog itself handles Escape and returning focus.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}

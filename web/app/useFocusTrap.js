"use client";

import { useEffect } from "react";

// Keeps Tab / Shift+Tab inside a modal dialog while it is open (WAI-ARIA dialog pattern): from the last focusable element
// Tab wraps to the first, and Shift+Tab from the first wraps to the last, so keyboard and screen-reader users can't wander
// into the page behind it. The dialog itself handles Escape and returning focus.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// One Tab / Shift+Tab press inside `el`: wraps at the ends (and pulls focus back in if it got out). True when it moved focus.
export function trapTab(e, el) {
  if (e.key !== "Tab" || !el) return false;
  const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!items.length) return false;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export default function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => trapTab(e, ref.current);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}

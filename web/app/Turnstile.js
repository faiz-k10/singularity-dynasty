"use client";

import { useEffect, useRef } from "react";

// The Turnstile widget (lib/turnstile.js). Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Inside a <form> it adds the
// hidden `cf-turnstile-response` field itself; `onToken` also hands the token over for forms posted as JSON.
const KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let loading = null;
function loadScript() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { loading = null; reject(); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export const turnstileKey = KEY;

export default function Turnstile({ onToken, action }) {
  const ref = useRef(null);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; }, [onToken]);
  useEffect(() => {
    if (!KEY) return;
    let id = null;
    let dead = false;
    loadScript().then((ts) => {
      if (dead || !ref.current) return;
      id = ts.render(ref.current, {
        sitekey: KEY,
        action,
        theme: document.documentElement.dataset.theme === "light" ? "light" : "auto",
        callback: (t) => cb.current?.(t),
        "expired-callback": () => cb.current?.(""),
        "error-callback": () => cb.current?.(""),
      });
    }).catch(() => {});
    return () => { dead = true; if (id != null) try { window.turnstile?.remove(id); } catch {} };
  }, [action]);
  if (!KEY) return null;
  return <div className="turnstile" ref={ref} />;
}

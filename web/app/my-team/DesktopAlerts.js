"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findAlerts, newAlerts } from "@/lib/desktopAlerts";

const ON_KEY = "myteam.desktopAlerts";
const SEEN_KEY = "myteam.alertsSeen";

const supported = () => typeof window !== "undefined" && "Notification" in window;

// Opt-in state for desktop alerts, remembered per browser. On only when the browser has granted permission.
export function useDesktopAlertsSetting() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (supported() && Notification.permission === "granted" && localStorage.getItem(ON_KEY) === "1") setOn(true);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  function set(next) {
    setOn(next);
    try {
      localStorage.setItem(ON_KEY, next ? "1" : "0");
    } catch {}
  }
  return [on, set];
}

// Fires the alerts lib/desktopAlerts.js finds, once each (shown keys kept in localStorage), every time the live data
// changes -- the 30-second poll keeps running in a background tab while alerts are on (MyTeamClient), so they arrive
// even when this tab isn't the one you're looking at.
export function useDesktopAlerts({ on, savedTeams, injuriesByTeam, gameStates }) {
  const prevWin = useRef({});
  useEffect(() => {
    if (on && supported() && Notification.permission === "granted") {
      const alerts = findAlerts({ savedTeams, injuriesByTeam, gameStates, prevWin: prevWin.current, now: Date.now() });
      let seen = [];
      try {
        seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
      } catch {}
      const { fresh, seen: next } = newAlerts(alerts, Array.isArray(seen) ? seen : []);
      // A first switch-on can find several at once; show the first few, the rest are marked seen.
      for (const a of fresh.slice(0, 4)) {
        try {
          const n = new Notification(a.title, { body: a.body, tag: a.key, icon: "/icon" });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {}
      }
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {}
    }
    prevWin.current = Object.fromEntries((savedTeams || []).map((t) => [t.id, t.settings?.winChance ?? null]));
  }, [on, savedTeams, injuriesByTeam, gameStates]);
}

// The switch. Permission is asked only when it's clicked; free accounts see where it comes from.
export default function DesktopAlertsToggle({ on, setOn, allowed }) {
  const [note, setNote] = useState(null);
  if (!allowed) {
    return (
      <span className="desk-alerts desk-alerts-locked">
        <BellIcon /> Alerts: <Link href="/#pricing">Explorer</Link>
      </span>
    );
  }
  async function toggle() {
    setNote(null);
    if (on) return setOn(false);
    if (!supported()) return setNote("Not supported in this browser");
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") setOn(true);
    else setNote("Blocked in your browser's site settings");
  }
  return (
    <span className="desk-alerts">
      <button
        type="button"
        className={`desk-alerts-btn${on ? " on" : ""}`}
        aria-pressed={on}
        onClick={toggle}
      >
        <BellIcon /> <span className="desk-alerts-label">Alerts</span> {on ? "On" : "Off"}
      </button>
      {note && <span className="desk-alerts-note">{note}</span>}
    </span>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 2a4 4 0 0 0-4 4v2.5L2.8 11h10.4L12 8.5V6a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

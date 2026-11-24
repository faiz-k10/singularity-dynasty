"use client";

import { useEffect } from "react";
import { creditSky } from "./skyCreditAction";

// The Night Sky's "Daily log in" star: the first page a signed-in member opens each day (Eastern, the Night Sky's day) earns it.
// Mounted once in the root layout. Only asks the server when a Supabase session cookie is present and this browser hasn't
// already been credited today; the server checks the account and counts it once a day either way.
const KEY = "sky.login";

export default function DailyLogin() {
  useEffect(() => {
    let timer;
    const check = () => {
      if (!/(^|; )sb-[^=]*-auth-token/.test(document.cookie)) return; // signed out: nothing to credit
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      try { if (localStorage.getItem(KEY) === day) return; } catch {}
      creditSky("login").then((r) => {
        if (r && !r.out) try { localStorage.setItem(KEY, day); } catch {}
      }).catch(() => {});
    };
    check();
    timer = setInterval(check, 10 * 60 * 1000); // a tab left open past midnight still earns the next day's star
    return () => clearInterval(timer);
  }, []);
  return null;
}

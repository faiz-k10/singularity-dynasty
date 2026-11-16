"use client";

import { useEffect, useRef } from "react";
import Turnstile from "./Turnstile";

// Drop into any <form> that a bot could abuse (Nov 16 2026): a honeypot field people never see or fill ("website"), the time
// the form appeared ("t", checked by tooFast in lib/turnstile.js) and the Turnstile widget (silent until its keys exist).
export default function BotGuard({ action, onToken }) {
  const t = useRef(null);
  useEffect(() => { if (t.current) t.current.value = String(Date.now()); }, []);
  return (
    <>
      <div className="bot-trap" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="t" ref={t} defaultValue="" />
      <Turnstile action={action} onToken={onToken} />
    </>
  );
}

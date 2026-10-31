"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setEmailDigest } from "./actions";

// The switch for the weekly "Your Players This Week" email. Free accounts see what it is and where it comes from.
export default function EmailDigestToggle({ tier, enabled }) {
  const [on, setOn] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  if (tier === "stargazer") {
    return (
      <p className="email-digest email-digest-locked" data-wall="email-digest">
        Get this every Tuesday by email &mdash; <Link href="/#pricing">Explorer</Link>.
      </p>
    );
  }
  function toggle(e) {
    const next = e.target.checked;
    setError(null);
    setOn(next);
    startTransition(async () => {
      const res = await setEmailDigest(next);
      if (res?.error) {
        setOn(!next);
        setError(res.error);
      }
    });
  }
  return (
    <div className="email-digest">
      <label>
        <input type="checkbox" checked={on} disabled={pending} onChange={toggle} />
        <span>Email me this every Tuesday</span>
      </label>
      {error && <span className="email-digest-err">{error}</span>}
    </div>
  );
}

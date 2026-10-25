"use client";

import Link from "next/link";
import { useState } from "react";

// A nav link that fetches the WHOLE page (its data, not just the loading skeleton) the moment the pointer or keyboard focus lands on it, so the
// click usually finds the page already on its way. Prefetching every tool page for every visitor on load would cost ~500KB each time; this
// costs one page, and only for a link someone is about to use.
export default function ToolLink({ href, children, ...rest }) {
  const [warm, setWarm] = useState(false);
  return (
    <Link href={href} prefetch={warm ? true : undefined} onMouseEnter={() => setWarm(true)} onFocus={() => setWarm(true)} {...rest}>
      {children}
    </Link>
  );
}

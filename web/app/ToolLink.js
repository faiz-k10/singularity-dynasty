"use client";

import Link from "next/link";
import { useState } from "react";

// A nav link that fetches the WHOLE page (its data, not just the loading skeleton) the moment the pointer or keyboard focus lands on it, so the
// click usually finds the page already on its way. Prefetching every tool page for every visitor on load would cost ~500KB each time; this
// costs one page, and only for a link someone is about to use.
// closeMenu: the link sits in a hover / focus dropdown (the Tools menu). On click the menu shuts at once -- otherwise the pointer still over it and the
// focus inside it keep it open on top of the new page, which reads as a slow click -- and stays shut until the pointer leaves it.
function shutMenu(e) {
  const host = e.currentTarget.closest(".nav-dropdown, .ehp-pm");
  e.currentTarget.blur();
  if (!host) return;
  host.classList.add("menu-shut");
  host.addEventListener("mouseleave", () => host.classList.remove("menu-shut"), { once: true });
}

export default function ToolLink({ href, children, closeMenu = false, onClick, ...rest }) {
  const [warm, setWarm] = useState(false);
  return (
    <Link
      href={href}
      prefetch={warm ? true : undefined}
      onMouseEnter={() => setWarm(true)}
      onFocus={() => setWarm(true)}
      onClick={(e) => {
        if (closeMenu) shutMenu(e);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

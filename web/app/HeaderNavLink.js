"use client";

import { usePathname } from "next/navigation";
import ToolLink from "./ToolLink";

// A header link that knows when its page is the one open: it gets `active` (ink text with the hairline underline) and aria-current.
export default function HeaderNavLink({ href, match = href, className = "", children }) {
  const path = usePathname() || "";
  const on = path === match || path.startsWith(`${match}/`);
  return (
    <ToolLink href={href} className={`${className}${on ? " active" : ""}`.trim() || undefined} aria-current={on ? "page" : undefined}>
      {children}
    </ToolLink>
  );
}

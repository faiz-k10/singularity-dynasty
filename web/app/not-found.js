import Link from "next/link";
import AuthCard from "./login/AuthCard";

export const metadata = {
  title: "Page Not Found — Singularity Dynasty",
};

// Any address that doesn't exist (and notFound() calls, e.g. an unknown Lab share link).
export default function NotFound() {
  return (
    <AuthCard eyebrow="404" title="This page drifted out of orbit." sub="The link may be old or mistyped. Everything else is where you left it.">
      <div className="auth-actions">
        <Link href="/" className="btn-primary">
          Home
        </Link>
        <Link href="/tools/redraft-rankings" className="btn-ghost">
          Weekly Rankings
        </Link>
      </div>
    </AuthCard>
  );
}

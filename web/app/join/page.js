import SiteHeader from "../SiteHeader";
import SignUpGate from "../SignUpGate";
import { safeNext } from "@/lib/authMessages";

// The sign-up prompt (14 days of Explorer): where every "sign up" / "sign in to ..." link for a signed-out visitor goes, with ?next=
// the page to come back to (and what My Team shows a signed-out visitor who tries to save a league).
export const metadata = { title: "Sign Up — Dynasty Singularity", robots: { index: false } };

export default async function JoinPage({ searchParams }) {
  const next = safeNext((await searchParams)?.next) || "/my-team";
  return (
    <div className="auth-page">
      <SiteHeader />
      <SignUpGate next={next} />
    </div>
  );
}

import SiteHeader from "../SiteHeader";
import SignUpGate from "../SignUpGate";

// What proxy.js shows a signed-out visitor in place of any tool page (the address stays the tool's, so the prompt can send them back to it).
export const metadata = { title: "Sign Up — Dynasty Singularity", robots: { index: false } };

export default function JoinPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <SignUpGate />
    </div>
  );
}

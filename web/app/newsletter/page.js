import SiteHeader from "../SiteHeader";
import ManagerQuiz from "../ManagerQuiz";

export const metadata = {
  title: "The Tuesday Transmission — Dynasty Singularity",
  description: "What kind of dynasty manager are you? Four questions, one minute: get your answer and the Tuesday Transmission, what moved before waivers.",
};

// The newsletter sign-up page: the Dynasty Manager quiz (app/ManagerQuiz.js), linked from the header's Newsletter menu.
export default function NewsletterPage() {
  return (
    <div className="auth-page">
      <SiteHeader />
      <main id="main-content" className="wrap doc-wrap nl-wrap">
        <div className="eyebrow">The Tuesday Transmission</div>
        <h1 className="doc-h1">What kind of dynasty manager are you?</h1>
        <p className="doc-lede">Four questions, one minute. You get your answer, and the Tuesday Transmission: what moved, before waivers, once a week.</p>
        <ManagerQuiz source="newsletter" />
      </main>
    </div>
  );
}

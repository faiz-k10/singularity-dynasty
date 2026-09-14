import Link from "next/link";
import SiteHeader from "../../SiteHeader";
import { createClient } from "@/lib/supabase/server";
import { loadInsight, GM_ARCHETYPE_QUESTIONS } from "@/lib/insights";
import QuizClient from "./QuizClient";

export const metadata = {
  title: "GM Archetype Quiz — Singularity Dynasty",
  description:
    "A 60-second quiz to find out what kind of dynasty GM you are -- aggressive win-now, patient rebuilder, or somewhere in between.",
};

// Free for any signed-in visitor, no saved team required -- this is the
// top-of-funnel half of the two-stage Archetype design (see
// lib/insights/gmArchetype.js): an immediate identity label that works
// before anyone's imported a roster, with a data-derived reconciliation
// against their ACTUAL team to come later once Team Analysis exists.
export default async function GmArchetypeQuizPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let existingResult = null;
  if (user) {
    const row = await loadInsight(supabase, { key: "gm_archetype_quiz", userId: user.id });
    existingResult = row?.value || null;
  }

  return (
    <div className="tool-page">
      <SiteHeader />
      <main className="wrap tool-wrap quiz-wrap">
        <div className="eyebrow">My Team</div>
        <h1>What Kind of GM Are You?</h1>
        <p className="tool-sub">
          Four questions, no roster required. We&apos;ll compare this to what your
          actual team says about you once Team Analysis ships.
        </p>

        {!user ? (
          <div className="tool-empty">
            <p>
              <Link href="/login">Sign in</Link> to take the quiz and save your result.
            </p>
          </div>
        ) : (
          <QuizClient questions={GM_ARCHETYPE_QUESTIONS} initialResult={existingResult} />
        )}
      </main>
    </div>
  );
}

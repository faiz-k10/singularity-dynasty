import Link from "next/link";
import QuizIcon from "../tools/QuizIcon";
import PortfolioPulse from "./PortfolioPulse";

// One combined panel: who you are as a GM (archetype quiz result, links to
// the quiz) on the left, how your whole portfolio is built (risk-profile
// bar from Portfolio Pulse) on the right. Replaces the old separate quiz
// card + Pulse card.
export default function PortfolioOverview({ archetype, summary }) {
  return (
    <section className="portfolio-overview glass-panel reveal in">
      <Link href="/my-team/quiz" className="po-archetype">
        <span className="quiz-corner-icon"><QuizIcon /></span>
        <span className="quiz-corner-text">
          <span className="quiz-corner-label">GM Archetype</span>
          <span className="quiz-corner-value">{archetype ? archetype.label : "Take the Quiz"}</span>
          <span className="po-archetype-hint">{archetype ? "Retake quiz →" : "2 minutes →"}</span>
        </span>
      </Link>

      {summary && <PortfolioPulse summary={summary} />}
    </section>
  );
}

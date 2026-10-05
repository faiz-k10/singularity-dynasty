import Link from "next/link";
import QuizIcon from "../tools/QuizIcon";

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

      {summary && (
        <div className="po-pulse">
          <div className="po-pulse-head">
            <div className="portfolio-pulse-label">Portfolio Pulse</div>
            <span className="portfolio-pulse-sub">{summary.totalSlots} roster slots across your saved teams</span>
          </div>
          {summary.profile ? (
            <>
              <div className="portfolio-pulse-bar">
                {summary.profile.map((b) => (
                  <div
                    key={b.key}
                    className={`portfolio-pulse-seg portfolio-pulse-seg-${b.key}`}
                    style={{ width: `${b.pct}%` }}
                    title={`${b.label}: ${b.pct}%`}
                  />
                ))}
              </div>
              <div className="portfolio-pulse-legend">
                {summary.profile.map((b) => (
                  <span key={b.key} className={`portfolio-pulse-legend-item portfolio-pulse-seg-${b.key}`}>
                    <span className="portfolio-pulse-swatch" />
                    {b.label} <strong>{b.pct}%</strong>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="portfolio-pulse-sub">Not enough simulation data yet to build a risk profile.</p>
          )}
        </div>
      )}
    </section>
  );
}

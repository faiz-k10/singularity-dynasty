// Clipboard/quiz-paper glyph for the GM Archetype quiz entry point --
// same hand-rolled inline-SVG, currentColor idiom as every other small
// icon on the site (TrendTag, ConfidenceBadge). A page
// outline with a clipboard clip at top, a few text lines, and a
// checkmark in a circle standing in for "answered/graded" -- reads as
// "quiz paper" at a glance without needing a label.
export default function QuizIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="3.5" width="15" height="18" rx="2.2" />
      <path d="M9 3.5V2.7a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 2.7v.8" />
      <rect x="8.7" y="2" width="6.6" height="2.6" rx="1" />
      <path d="M8 9h5" />
      <path d="M8 12.2h8" />
      <path d="M8 15.4h5.5" />
      <circle cx="16.5" cy="17" r="3" fill="var(--void-panel)" />
      <path d="M15 17l1.1 1.1L18 16.2" />
    </svg>
  );
}

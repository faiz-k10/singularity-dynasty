// One outlined rocket pointing up (the pricing ladder's tier mark: one, two or three of them). Stroke only, in the current text colour, like the outlined
// numerals it replaced.
export default function Rocket() {
  return (
    <svg className="rocket" viewBox="0 0 24 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2c4 6 5 14 5 24v10H7V26C7 16 8 8 12 2Z" />
      <path d="M7 28 2 38v4l5-6M17 28l5 10v4l-5-6" />
      <circle cx="12" cy="18" r="2.6" />
      <path d="M9.5 39 12 46l2.5-7" />
    </svg>
  );
}

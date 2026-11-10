import { MARK_DISC, MARK_SPIRAL, MARK_BALL, MARK_STROKE } from "./brandMark";

// The mark as an <svg> for the generated images (favicon, apple icon, share image, share cards, the brand files) -- Satori reads inline svg.
// `bold` scales the line's width (thicker for a tiny favicon, thinner for a big avatar); `bg` draws the football's laces (left off when not given).
export function MarkSvg({ size, ink, ember, bg, bold = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "flex" }}>
      <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={ink} />
      <path d={MARK_SPIRAL} fill="none" stroke={ember} strokeWidth={MARK_STROKE * bold} strokeLinecap="round" />
      <g transform={MARK_BALL.transform}>
        <path d={MARK_BALL.d} fill={ember} />
        {bg && <path d={MARK_BALL.laces} stroke={bg} strokeWidth={0.16} strokeLinecap="round" fill="none" />}
      </g>
    </svg>
  );
}

import { MARK_DISC, MARK_SPIRAL, MARK_BALL, MARK_CENTER_BALL, MARK_DS, MARK_DISC_DS, MARK_STROKE } from "./brandMark";

// The mark as an <svg> for the generated images (favicon, apple icon, share image, share cards, the brand files) -- Satori reads inline svg.
// `bold` scales the line's width (thicker for a tiny favicon, thinner for a big avatar); `bg` (the background colour) draws the football in the
// disc and the small ball's laces -- left off when not given. `initials`: the share-picture logo (Nov 17 2026), the letters DS upright and
// large in the disc (the "-ds" brand files) instead of the football; needs `bg`.
export function MarkSvg({ size, ink, ember, bg, bold = 1, initials = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "flex" }}>
      <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={ink} />
      {bg && initials && <path d={MARK_DS} transform={MARK_DISC_DS.transform} fill={bg} />}
      {bg && !initials && (
        // the football in the middle of the disc, in the background colour; its laces (DS + the seam) in the disc's
        <g transform={MARK_CENTER_BALL.transform}>
          <path d={MARK_CENTER_BALL.d} fill={bg} />
          <path d={MARK_DS} transform={MARK_CENTER_BALL.dsTransform} fill={ink} />
          <path d={MARK_CENTER_BALL.seam} stroke={ink} strokeWidth={MARK_CENTER_BALL.seamWidth} strokeLinecap="round" fill="none" />
        </g>
      )}
      <path d={MARK_SPIRAL} fill="none" stroke={ember} strokeWidth={MARK_STROKE * bold} strokeLinecap="round" />
      <g transform={MARK_BALL.transform}>
        <path d={MARK_BALL.d} fill={ember} />
        {bg && <path d={MARK_BALL.laces} stroke={bg} strokeWidth={0.16} strokeLinecap="round" fill="none" />}
      </g>
    </svg>
  );
}

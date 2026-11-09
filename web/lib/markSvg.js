import { MARK_DISC, MARK_SPIRAL, MARK_SPECK, MARK_STROKE } from "./brandMark";

// The mark as an <svg> for the generated images (favicon, apple icon, share image, share cards) -- Satori reads inline svg. `bold` thickens the
// line and speck for tiny sizes. See lib/brandMark.js.
export function MarkSvg({ size, ink, ember, bold = 1 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "flex" }}>
      <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={ink} />
      <path d={MARK_SPIRAL} fill="none" stroke={ember} strokeWidth={MARK_STROKE * bold} strokeLinecap="round" />
      <circle cx={MARK_SPECK.cx} cy={MARK_SPECK.cy} r={MARK_SPECK.r * Math.max(1, bold * 0.85)} fill={ember} />
    </svg>
  );
}

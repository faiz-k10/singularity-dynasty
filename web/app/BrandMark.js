import { MARK_DISC, MARK_SPIRAL, MARK_BALL, MARK_CENTER_BALL, MARK_STROKE } from "@/lib/brandMark";

// The logo as INLINE svg (Nov 10 2026: drawn as CSS mask images it was rasterised at a low resolution and looked blurry; inline svg stays sharp
// at any size and screen density). Geometry from lib/brandMark.js. Colours come from CSS: the disc is `--mark-disc` (the page's text colour by
// default), the line and its football `--mark-accent` (ember on the light theme, cobalt on the dark). The football in the disc and the small
// ball's laces are CUT OUT with masks, so they show whatever is behind the logo. Two copies of the mask ids on one page are harmless: they are identical.
export default function BrandMark({ className = "ring" }) {
  const { cx, cy, r } = MARK_DISC;
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <mask id="sd-mark-disc" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
          <circle cx={cx} cy={cy} r={r} fill="#fff" />
          <g transform={MARK_CENTER_BALL.transform}>
            <path d={MARK_CENTER_BALL.d} fill="#000" />
            <path d={MARK_CENTER_BALL.laces} stroke="#fff" strokeWidth={MARK_CENTER_BALL.lacesWidth} strokeLinecap="round" fill="none" />
          </g>
        </mask>
        <mask id="sd-mark-line" maskUnits="userSpaceOnUse" x="-2" y="-2" width="44" height="44">
          <rect x="-2" y="-2" width="44" height="44" fill="#fff" />
          <g transform={MARK_BALL.transform}>
            <path d={MARK_BALL.laces} stroke="#000" strokeWidth="0.3" strokeLinecap="round" fill="none" />
          </g>
        </mask>
      </defs>
      <rect width="40" height="40" fill="var(--mark-disc, var(--star))" mask="url(#sd-mark-disc)" />
      <g mask="url(#sd-mark-line)" fill="var(--mark-accent)">
        <path d={MARK_SPIRAL} fill="none" stroke="var(--mark-accent)" strokeWidth={MARK_STROKE} strokeLinecap="round" />
        <g transform={MARK_BALL.transform}>
          <path d={MARK_BALL.d} />
        </g>
      </g>
    </svg>
  );
}

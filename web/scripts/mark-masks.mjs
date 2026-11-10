// Prints the two CSS mask data-URIs for the mark (the disc, and the spiral + football with its laces cut out) from lib/brandMark.js, for the
// "THE MARK" block in app/globals.css. Run from web/: node scripts/mark-masks.mjs
import { MARK_DISC, MARK_SPIRAL, MARK_BALL, MARK_CENTER_BALL, MARK_STROKE } from "../lib/brandMark.js";
const q = (s) => `url("data:image/svg+xml,${encodeURIComponent(s).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/").replace(/'/g, "%27")}")`;
// the disc with the football cut out of its middle (the laces stay part of the disc)
const disc = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><defs><mask id='d'><circle cx='${MARK_DISC.cx}' cy='${MARK_DISC.cy}' r='${MARK_DISC.r}' fill='white'/><g transform='${MARK_CENTER_BALL.transform}'><path d='${MARK_CENTER_BALL.d}' fill='black'/><path d='${MARK_CENTER_BALL.laces}' stroke='white' stroke-width='${MARK_CENTER_BALL.lacesWidth}' stroke-linecap='round' fill='none'/></g></mask></defs><rect width='40' height='40' mask='url(#d)'/></svg>`;
const line = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><defs><mask id='l'><rect x='-5' y='-5' width='50' height='50' fill='white'/><g transform='${MARK_BALL.transform}'><path d='${MARK_BALL.laces}' stroke='black' stroke-width='0.3' stroke-linecap='round' fill='none'/></g></mask></defs><g mask='url(#l)'><path d='${MARK_SPIRAL}' fill='none' stroke='black' stroke-width='${MARK_STROKE}' stroke-linecap='round'/><g transform='${MARK_BALL.transform}'><path d='${MARK_BALL.d}'/></g></g></svg>`;
console.log("DISC " + q(disc));
console.log("LINE " + q(line));

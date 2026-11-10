import ToolLink from "./ToolLink";

// The Tools dropdown's rows (My Team first since Nov 10 2026, founder), ONE source for the landing page's header (EventHorizon.js) and every other page's header (SiteHeader.js) (founder,
// Nov 10 2026: "this dropdown doesn't look like the one on the main landing page"). Each tool has its own small planet, a name, one line on what it
// does and what is free; the page is fetched on hover (ToolLink). Styles: the `.tmenu-*` block at the end of globals.css.
export const TOOLS_MENU = [
  { href: "/my-team", name: "My Team", say: "Every league you play, live, on one screen.", free: "1 league free" },
  { href: "/tools/redraft-rankings", name: "Weekly Projection Rankings", say: "Every player's range this week, matchups included.", free: "Top 50 free" },
  { href: "/tools/draft-board", name: "Dynasty Board", say: "Production against age, tiered by who is truly ahead.", free: "Top 20 free" },
  { href: "/tools/player-simulations", name: "Player Season Simulations", say: "Where each player's season is heading.", free: "Top 10 free" },
  { href: "/tools/lab", name: "The Observatory", say: "Any two numbers, every player, one chart.", free: "Top 50 free" },
];

// a planet with two moons, a plain disc, a ringed planet, a planet with a moon on its orbit, a banded one (24-unit svgs in currentColor)
const PLANET_GLYPHS = [
  // My Team: a little system -- a planet with two moons (all your leagues around you)
  <svg key="m" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor" /><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth=".8" strokeOpacity=".55" /><circle cx="20.8" cy="8.6" r="1.9" fill="currentColor" /><circle cx="4" cy="16.4" r="1.5" fill="currentColor" /></svg>,
  <svg key="a" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="currentColor" /></svg>,
  <svg key="b" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.6" fill="currentColor" /><ellipse cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-20 12 12)" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>,
  <svg key="c" viewBox="0 0 24 24"><circle cx="11" cy="13" r="6" fill="currentColor" /><circle cx="11" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth=".9" strokeDasharray="1.5 2.2" /><circle cx="19.6" cy="6.4" r="1.9" fill="currentColor" /></svg>,
  <svg key="d" viewBox="0 0 24 24"><defs><clipPath id="tmenu-band"><circle cx="12" cy="12" r="7.5" /></clipPath></defs><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><g clipPath="url(#tmenu-band)" fill="currentColor"><rect x="3" y="8.4" width="18" height="2.1" /><rect x="3" y="12.2" width="18" height="2.1" /><rect x="3" y="16" width="18" height="2.1" /></g></svg>,
];

export default function ToolsMenuRows() {
  return TOOLS_MENU.map((t, i) => (
    <ToolLink key={t.href} href={t.href} className="tmenu-row">
      <span className="tmenu-n" aria-hidden="true">{PLANET_GLYPHS[i]}</span>
      <span className="tmenu-t">
        <b>{t.name}</b>
        <i>{t.say}</i>
      </span>
      <span className="tmenu-f">{t.free}</span>
      <span className="tmenu-a" aria-hidden="true">→</span>
    </ToolLink>
  ));
}

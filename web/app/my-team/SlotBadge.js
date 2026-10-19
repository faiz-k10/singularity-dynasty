// A starter's lineup slot (QB, RB, FLEX, SUPERFLEX...) as an outline pill; shared by the roster table and the
// head-to-head matchup view.
// Display-only relabel -- Sleeper's own roster_positions/starters value is
// the literal string "SUPER_FLEX"; sorting/matching still uses that raw
// value everywhere, this just renders it without the underscore.
function formatSlot(slot) {
  if (!slot) return "BN";
  return slot === "SUPER_FLEX" ? "SUPERFLEX" : slot;
}

// Deliberately an OUTLINE pill (transparent fill, colored border+text via
// currentColor) rather than PositionBadge's solid fill -- Slot and
// Position are genuinely different facts (a FLEX slot says nothing about
// which position fills it) that happened to look like duplicated color
// coding when Slot was a plain-text first column sitting right next to
// the position-stripe every .rankings-table already draws on its own
// first cell. Single-position slots borrow that position's color; FLEX/
// SUPERFLEX (not tied to one position) get their own accent instead.
const SLOT_COLOR_VAR = {
  QB: "--pos-qb",
  RB: "--pos-rb",
  WR: "--pos-wr",
  TE: "--pos-te",
  FLEX: "--neon-blue",
  SUPER_FLEX: "--horizon-gold",
};

export default function SlotBadge({ slot }) {
  if (!slot) return <span className="mono">BN</span>;
  const colorVar = SLOT_COLOR_VAR[slot];
  return (
    <span className="slot-badge" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
      {formatSlot(slot)}
    </span>
  );
}

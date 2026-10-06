import { ARCHETYPE_BLURB, ARCHETYPE_SHORT } from "@/lib/archetypes";

// The role-group pill ("Lead Back", "Slot / YAC Receiver", ...). The description lives in the hover
// title. `compact` is the small version used on the comparison cards: a shorter name (full name on
// hover) so it fits the card's narrow first column.
export default function ArchetypePill({ name, compact = false }) {
  if (!name) return null;
  const blurb = ARCHETYPE_BLURB[name];
  if (!compact) {
    return (
      <span className="archetype-pill" title={blurb}>
        {name}
      </span>
    );
  }
  return (
    <span className="archetype-pill archetype-pill-compact" title={blurb ? `${name} -- ${blurb}` : name}>
      {ARCHETYPE_SHORT[name] || name}
    </span>
  );
}

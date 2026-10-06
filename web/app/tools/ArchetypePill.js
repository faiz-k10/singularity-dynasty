import { ARCHETYPE_SHORT } from "@/lib/archetypes";

// The role-group pill ("Lead Back", "Slot / YAC Receiver", ...). `compact` is the small version used
// under a comparison card's match percentage: a shorter name (full name on hover) so it fits that column.
export default function ArchetypePill({ name, compact = false }) {
  if (!name) return null;
  if (!compact) return <span className="archetype-pill">{name}</span>;
  return (
    <span className="archetype-pill archetype-pill-compact" title={name}>
      {ARCHETYPE_SHORT[name] || name}
    </span>
  );
}

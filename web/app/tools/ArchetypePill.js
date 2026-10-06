import { ARCHETYPE_BLURB, ARCHETYPE_SHORT, TAG_TONE } from "@/lib/archetypes";

// One tag pill: a role group ("Lead Back"), a sustainability label ("Running Hot") or a career stage
// ("Prime"). With `onClick` it is a toggle button (`active` = the selected one). `compact` is the small
// version on the comparison cards: a shorter name for roles, full name on hover.
export default function ArchetypePill({ name, compact = false, active = false, onClick }) {
  if (!name) return null;
  const blurb = ARCHETYPE_BLURB[name];
  const cls = ["archetype-pill", compact && "archetype-pill-compact", `tone-${TAG_TONE[name] || "role"}`, onClick && "tag-btn"].filter(Boolean).join(" ");
  const text = compact ? ARCHETYPE_SHORT[name] || name : name;
  const title = blurb ? (compact ? `${name} -- ${blurb}` : blurb) : name;
  if (onClick) {
    return (
      <button type="button" className={cls} aria-pressed={active} onClick={onClick} title={title}>
        {text}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {text}
    </span>
  );
}

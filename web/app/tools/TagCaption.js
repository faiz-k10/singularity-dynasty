import { ARCHETYPE_BLURB, STAGE_TEXT } from "@/lib/archetypes";

// The sentence under the tag pills in a player's panel: explains whichever tag is selected.
export default function TagCaption({ row, kind }) {
  if (kind === "role") {
    const blurb = ARCHETYPE_BLURB[row.archetype];
    if (!blurb && !row.archetypeNear) return null;
    return (
      <>
        {blurb && <p className="role-block-blurb">{blurb}</p>}
        {row.archetypeNear && (
          <p className="role-block-near">
            Close to <strong>{row.archetypeNear}</strong>{" "}&mdash; his role sits near the line between the two.
          </p>
        )}
      </>
    );
  }
  if (kind === "sus") {
    const fp = row.susFp;
    const xfp = row.susXfp;
    if (fp == null || xfp == null) return null;
    const gap = Math.abs(fp - xfp).toFixed(1);
    if (row.sus === "Running Hot") {
      return (
        <p className="role-block-near">
          Scoring <strong>{gap}</strong> points a game above what his opportunity suggests ({fp.toFixed(1)} vs {xfp.toFixed(1)} expected). Production like this has tended to settle back toward expected.
        </p>
      );
    }
    if (row.sus === "Running Cold") {
      return (
        <p className="role-block-near">
          Scoring <strong>{gap}</strong> points a game below what his opportunity suggests ({fp.toFixed(1)} vs {xfp.toFixed(1)} expected). Production like this has tended to rebound toward expected.
        </p>
      );
    }
    return (
      <p className="role-block-near">
        Producing about what his opportunity suggests ({fp.toFixed(1)} vs {xfp.toFixed(1)} expected).
      </p>
    );
  }
  if (kind === "stage") {
    const text = STAGE_TEXT[row.position]?.[row.stage];
    return (
      <p className="role-block-near">
        Age <strong>{row.age}</strong>{text ? <> &mdash; {text}.</> : "."}
      </p>
    );
  }
  return null;
}

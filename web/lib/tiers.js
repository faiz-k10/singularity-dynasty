// Gap-based tiering for POR (the only tierable metric -- floor/median/
// ceiling tiering was removed by request): sort players by POR and start
// a new tier wherever the drop to the next player is unusually large
// relative to the other gaps in that same list, rather than a fixed
// player-count per tier.
//
// The threshold is median gap + 9 * MAD (median absolute deviation), not
// mean + stdev. Mean/stdev is an outlier magnet on a 425-player pool: a
// handful of huge gaps between elite players at the very top inflate the
// stdev so much the threshold stops triggering for the rest of the list
// entirely -- verified on the real POR pool, where mean+stdev produced a
// real break every ~5 players in the top 24, then dumped the remaining
// 402 into one "Tier 6" spanning POR +75 down to -150, well past several
// real drop-offs. Median/MAD is the standard robust fix: half the gaps
// are literally unaffected by how extreme the other half get, so outlier
// gaps at the top can't silently raise the bar for everyone below them.
// The multiplier went 3x -> 5x -> 9x across two rounds of "still too
// strict" feedback against the real pool -- 3x gave 31 tiers (a lot of
// 1-3 player tiers mid-pack), 5x trimmed to 18 but still split e.g.
// McCaffrey/Chase/Brown/McBride/Cook/Achane (a 163.2-to-147.4 POR run
// with no gap over 4.8) across three separate tiers, 9x is the smallest
// multiplier that keeps that whole run together (8 tiers total) without
// disturbing the sharply-separated top tiers.
function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianMadThreshold(gaps) {
  const medianGap = median(gaps);
  const mad = median(gaps.map((g) => Math.abs(g - medianGap)));
  return medianGap + 9 * mad * 1.4826;
}

// maxSpan is a second, independent break condition on top of the gap
// threshold: gap-based tiering only reacts to one unusually large step
// between adjacent players, not to a tier's cumulative width, so a long
// run of players declining in small, individually-unremarkable steps
// (mostly 0.1-3 points) can still rack up a huge total spread -- verified
// on the real POR pool, where a 33-player run each just barely under the
// gap threshold still spanned 33 points top to bottom, and a later 144-
// player run spanned 186 points. maxSpan forces a break once a tier's
// running width (current player vs. the tier's first player) exceeds it,
// regardless of how small the step that crossed the line was.
function groupByGaps(arr, metric, thresholdFn, maxSpan) {
  const gaps = [];
  for (let i = 1; i < arr.length; i++) {
    gaps.push(arr[i - 1][metric] - arr[i][metric]);
  }
  const threshold = thresholdFn(gaps);

  const groups = [[arr[0]]];
  for (let i = 1; i < arr.length; i++) {
    const gap = arr[i - 1][metric] - arr[i][metric];
    const currentGroup = groups[groups.length - 1];
    const span = currentGroup[0][metric] - arr[i][metric];
    if ((gap > threshold && gap > 0) || span > maxSpan) {
      groups.push([arr[i]]);
    } else {
      currentGroup.push(arr[i]);
    }
  }
  return groups;
}

// A lone player stranded in their own tier reads as noise unless they're
// truly a class apart -- fold them into whichever neighboring tier they're
// numerically closer to. The very top tier is exempt: a real "alone at
// the top" standout (a clear position-1 with real separation) is a
// legitimate, expected tier shape, not something to paper over. Same
// exemption applies (via maxSpan) at the bottom: if merging a singleton
// into either neighbor would blow that neighbor's span past the cap, it's
// a genuine outlier -- not noise to paper over -- so it stays on its own
// rather than dragging a merged tier's width back out past maxSpan.
function mergeSingletons(groups, metric, maxSpan) {
  let i = 1;
  while (i < groups.length) {
    if (groups[i].length !== 1) {
      i++;
      continue;
    }
    const value = groups[i][0][metric];
    const prevGap = value !== undefined ? groups[i - 1][groups[i - 1].length - 1][metric] - value : Infinity;
    const nextGap = i < groups.length - 1 ? value - groups[i + 1][0][metric] : Infinity;

    const hasNext = i < groups.length - 1;
    const prevSpan = groups[i - 1][0][metric] - value;
    const nextSpan = hasNext ? value - groups[i + 1][groups[i + 1].length - 1][metric] : 0;
    const prevOk = prevSpan <= maxSpan;
    const nextOk = hasNext && nextSpan <= maxSpan;

    if (!prevOk && !nextOk) {
      i++;
      continue;
    }

    if (prevOk && (prevGap <= nextGap || !nextOk)) {
      groups[i - 1].push(groups[i][0]);
    } else {
      groups[i + 1].unshift(groups[i][0]);
    }
    groups.splice(i, 1);
    // Re-check the same index -- the merge may have left a new adjacency
    // that itself now needs evaluating (rare, but cheap to be safe about).
  }
  return groups;
}

// POR is already position-adjusted -- each player's score is measured
// against his OWN position's replacement level, which is exactly what
// makes it comparable ACROSS positions (that's the whole point of the
// stat). Tiering it per-position would silently re-introduce a position
// axis into a number specifically built to not have one, and produces
// exactly the nonsense a viewer would (rightly) flag: two players 2
// points apart landing in different tiers because they happen to play
// different positions. So tiers are computed once, across the whole
// pool, with no position grouping at all.
// Matches the span of the already-good tiers the gap threshold alone
// produces near the top of the pool (14.8-15.8 points) -- keeps the cap
// from feeling arbitrary relative to what "one tier" already looks like
// elsewhere on the same page.
const MAX_POR_TIER_SPAN = 16;

export function computeGlobalTierMap(poolRows, metric) {
  const arr = [...poolRows].sort((a, b) => b[metric] - a[metric]);
  if (arr.length === 0) return {};

  const groups = mergeSingletons(
    groupByGaps(arr, metric, medianMadThreshold, MAX_POR_TIER_SPAN),
    metric,
    MAX_POR_TIER_SPAN
  );
  const tierByName = {};
  groups.forEach((group, tierIndex) => {
    for (const player of group) {
      tierByName[player.player_name] = tierIndex + 1;
    }
  });
  return tierByName;
}

// WOPR/EPA are NOT position-adjusted the way POR is -- a TE's WOPR is
// structurally lower than a WR's (fewer high-air-yards targets), and QB
// EPA lives on a totally different scale than RB/WR/TE EPA (accumulated
// over far more plays). Tiering those globally would mostly just sort by
// position rather than surfacing real within-position separation, which
// is exactly the "reintroducing a position axis" failure mode
// computeGlobalTierMap's own comment above warns POR away from -- just
// the mirror-image mistake, applied to a metric that actually needs the
// position axis. So this tiers within each position independently
// (tier numbers reset to 1 per position, same gap/MAD/maxSpan mechanics
// otherwise) rather than reusing computeGlobalTierMap.
// MAX_POR_TIER_SPAN is a fixed point value calibrated to POR's own scale
// (roughly -150 to +250) -- reusing it as-is for WOPR (0-0.85) or EPA
// would make the span cap a permanent no-op (every gap is under 16), so
// per-position maxSpan is instead a fraction of that position's own
// observed range for the metric. 15% is a judgment call, not backtested
// the way the decay values are -- matches roughly the same proportion
// MAX_POR_TIER_SPAN represents of POR's own full pool range (16 / ~400).
const RELATIVE_MAX_TIER_SPAN_FRACTION = 0.15;

export function computeTierMapByPosition(poolRows, metric) {
  const byPosition = {};
  for (const row of poolRows) {
    if (row[metric] == null) continue; // e.g. QB has no wopr
    (byPosition[row.position] ??= []).push(row);
  }
  const tierByName = {};
  for (const rows of Object.values(byPosition)) {
    const arr = [...rows].sort((a, b) => b[metric] - a[metric]);
    const range = arr[0][metric] - arr[arr.length - 1][metric];
    const maxSpan = range * RELATIVE_MAX_TIER_SPAN_FRACTION || Infinity;
    const groups = mergeSingletons(
      groupByGaps(arr, metric, medianMadThreshold, maxSpan),
      metric,
      maxSpan
    );
    groups.forEach((group, tierIndex) => {
      for (const player of group) {
        tierByName[player.player_name] = tierIndex + 1;
      }
    });
  }
  return tierByName;
}

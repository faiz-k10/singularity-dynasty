# Monte Carlo Projection Engine

Prototyped in an extended R/Claude Code session. Powers (or will power) three
product tools: **Player Season Simulations**, **Best Ball Rankings**, and
**Redraft Weekly Rankings**. This is the design record — read it before
changing any locked parameter, since most of them were arrived at by ruling
out a wrong first guess.

**Status: prototype, not wired to production.** `projection_engine.R` runs
standalone and prints/returns a data frame. It does not write to Supabase.
Publishing into `player_simulations` / `best_ball_rankings` /
`redraft_rankings` is still the manual Table Editor step described in the
root `CLAUDE.md`, same as the other five tools.

## Data source

[`nflreadr`](https://nflreadr.nflverse.com/) — free, real NFL weekly stats
via `load_player_stats()`. `install.packages("nflreadr")`.

## Core method: bootstrap resampling, not a normal-distribution assumption

Instead of fitting a bell curve to a player's history, the engine resamples
directly from their real game log (`sample(games, n, replace=TRUE)`). This
captures real skew/floor/boom-game shape that a normal distribution can't —
verified against a real boom-bust WR game log early in the session, where
the normal-assumption method understated true bust risk by ~15x
(`P(season<100)`: 0.2% normal vs 3% bootstrap). This is a legitimate,
named Monte Carlo technique — running it 10,000+ times per player is what
the site's own copy ("Full-season Monte Carlo simulations run 10,000 times
per player") describes.

## Recency weighting

Every historical game gets a weight `decay^games_ago`, most recent game
weighted highest. Backtested via **walk-forward validation with zero
lookahead**: for each player, at each point in their history, predict the
next game using only games before it, sweep candidate decay values, score
against what actually happened.

Two different decay values per position, because they optimize different
things:

| Position | Median decay (Redraft) | Ceiling decay (Best Ball) |
|---|---|---|
| RB | 0.87 | 0.89 |
| QB | 0.90 | 0.98 |
| WR | 0.89 | 0.92 |
| TE | 0.92 | 0.93 |

Ceiling decay is consistently closer to 1.0 (less aggressive) than median
decay — estimating a rare/extreme outcome needs more effective sample size
than estimating a typical week, and heavy decay shrinks effective sample
size.

**Confidence varies by position.** RB decay tuning is strong (~5-7%
improvement over uniform weighting). QB's ceiling decay barely matters
(<1% improvement, nearly flat backtest curve) — don't over-trust QB=0.98
as precisely correct, just "close to uniform is fine for QB."

## Quantile calibration ("floor"/"ceiling" aren't literally the 10th/90th percentile)

A naive `quantile(x, 0.90)` on a player's own weighted history is
systematically **miscalibrated** — it gets exceeded ~12-14% of the time out
of sample, not 10%. This is a small-sample quantile bias, not a decay
problem. Fixed by finding, per position, which *internal* quantile actually
produces a true ~10% real-world exceed/undershoot rate:

| Position | Ceiling internal q | Floor internal q |
|---|---|---|
| RB | 0.94 | 0.08 |
| QB | 0.94 | 0.09 |
| WR | 0.92 | 0.12 |
| TE | 0.93 | 0.12 |

So "ceiling" on RB is `weighted_quantile(x, w, 0.94)`, not `0.90`. This is
what actually makes Best Ball Rankings and Redraft Rankings diverge as two
real outputs of the model, not just relabeled versions of the same number.

**Always use interpolated quantiles**, not step-function ones. A step
quantile can jump onto one specific game's exact value if that game holds a
lot of weight — found via a Michael Wilson case where his "ceiling" was
literally his single best recent game (33.5) rather than a stable
statistical property. Interpolating between the two straddling values fixed
it (27.2).

## Week 18 exclusion

Week 18 (the actual final week of the 18-week NFL regular season — not week
17, which is a normal week and the final week of most fantasy playoffs)
shows a real ~8% scoring depression, matching week 1's depression, from
rested starters and backups playing. Confirmed with real touch/point data
before excluding it. Removing it fixed two ranking artifacts on its own (a
backup RB's inflated ceiling that was one week-18 spike start; a
context-flagged RB's inflated median that was largely week-18 games) — no
special-case rule needed for either once the bad data was removed.

**Retune after any eligibility-threshold change.** Parameters above were
retuned twice this session (once when the eligibility floor moved 30→20,
again for 20→15) because lowering the games-required threshold changes
which players enter the backtest population and how much history each
prediction is made from. They were stable across both retunes (small
single-decimal shifts), which is reassuring, but don't assume future
threshold changes will be equally harmless — always retune, don't just
truncate.

## Eligibility

`MIN_GAMES = 15`. Chosen for coverage over caution — the user's call:
"if there is variability with less games played, we just have to bet that
the issue will resolve itself eventually as the sample size builds up."
Coverage of fantasy-relevant 2025 players: 72% at 30 games → 83% at 20 →
**92% at 15**. The remaining 8% (mostly players with under 15 games — e.g.
mid-season rookie starters) are not covered by anything in this engine.

**Known consequence of the low threshold:** single-season players (mostly
2025 rookies) show compressed medians with full-sized ceilings (e.g. Ashton
Jeanty: median 9.4, ceiling 30.1 — a 3.2x spread vs ~1.5-2x for established
players). One or two big games dominate a thin sample's upper quantile.
Expect these players to rank higher in Best Ball than Redraft for reasons
that are a sample-size artifact, not a real boom-bust profile, until their
sample grows.

## Availability adjustment (season totals only)

Weekly figures (Redraft median/floor, Best Ball ceiling) are **pure
per-game numbers, no availability baked in** — explicit product decision,
since a single week's ranking is a "who do I start this week" question
where an injured player isn't in the decision at all, and blending in a
season-long availability rate there would double-count what the reader
already knows.

Season totals (`Player Season Simulations`) **do** need it — the sim
assumes up to `MAX_GAMES_PER_SEASON = 16` games (17 weeks minus 1 bye), each
played with probability = the player's recency-weighted availability rate
(`AVAILABILITY_YEAR_DECAY = 0.6`, not backtested, a judgment call). Fixed
two real errors along the way: (1) season totals were previously summing 17
games with no bye-week accounting, overstating everyone by ~6%; (2) durable
players like Bijan Robinson (100% availability) were being outranked by
name-brand players who miss real time (Christian McCaffrey, 77% — 2024 was
largely lost to injury), which inverted correctly once availability was
applied (Bijan's season total overtakes CMC's).

Availability is naive — it can't distinguish "missed games from injury"
from "was a healthy inactive backup," and treats each week's absence as
independent (real injuries cluster into multi-week absences, so this
somewhat understates season-total variance). Fine for the durable/injured
split among clear starters; noisier further down the depth chart.

## RB tiering for shrinkage (RB only, not yet built for WR/QB/TE)

The pool a shrunk player's projection blends toward excludes "bellcow" RBs
(top 15% by touches/game — objectively defined, not a named list) so a
limited-role back doesn't regress toward a McCaffrey/Bijan-level baseline.
The common-tier pool's median is meaningfully lower than the full pool's
(6.8 vs 8.5 PPG) while its right tail is barely touched (max 51.3 vs 55.4) —
a common-tier back can still simulate a big game, they just don't regress
toward "bellcow-typical" production by default.

## Shrinkage mechanism — a real bug found and fixed

Shrinkage blends a context-flagged player's own weighted history with the
positional baseline pool, `SHRINK_OWN_SHARE = 0.80` (not backtested — 70/30,
75/25, 80/20, and 90/10 were all hand-compared; 80/20 was the final pick,
explicitly the user's discretion, not a data-driven optimum).

**The first implementation was wrong and it's worth understanding why.**
Mixing the two raw distributions together and *then* taking a quantile of
the combined pool does not reliably land between the two components'
individual quantiles — verified this breaks concretely on Kenny Gainwell:
his own ceiling was 26.0, the baseline pool's ceiling was 23.1, but the
naive mixed-then-quantile approach produced **29.4** — higher than either
input. Root cause: Gainwell's own distribution had a wide empty gap that
interpolation smoothed over when he was alone; adding thousands of dense
pool games filled that gap, which *removed* the smoothing and let one of
his own high-value games dominate the tail instead. Fixed by computing each
side's quantile **separately** and blending the two numbers
(`shrunk_quantile()` in the engine) — guaranteed to land between the two
inputs, no exceptions.

**Trigger mechanism is designed but not implemented.** The intended trigger
is a manually maintained table — 32 teams × per-offseason flag for
"team-level OC/HC change" — checked once per offseason, plus automatic
detection of a player switching teams (already free from the loaded data).
Neither exists yet in this repo. `shrunk_quantile()` works and is ready to
call; nothing currently calls it.

**Severity is uniform, deliberately.** Originally scoped as two severities
(full shrink toward baseline for zero-sample players/rookies, lighter
partial shrink for established players with a flagged context change) — the
user then decided to treat both classes the same (partial, 80/20), since
the real distinguishing factor is "does this player have an established
personal track record at all," not the specific nature of the context
change. Rookie/zero-sample handling itself is explicitly deferred (see
below) — when it's built, it should probably use a heavier shrink than 80/20
for that case specifically, since it's the case the two-severity design was
originally meant for.

## Deferred — explicitly out of scope for now

- **Rookies / players below `MIN_GAMES`.** Needs the shrinkage path wired to
  an actual "zero relevant history" trigger. User's call: not being handled
  yet, revisit later.
- **Redraft matchup-adjustment** (pace of play, offensive/defensive
  rankings). The live `/tools/redraft-rankings` page copy says
  "matchup-adjusted" — nothing in this engine does that yet. Real gap
  between current copy and current capability until this is built.
- **WR/QB/TE tiering** for shrinkage baselines. Only RB has the
  bellcow-exclusion treatment; the other three positions' baseline pools are
  untiered (all eligible players pooled together).
- **Role-stability / touch-volume signal.** The model has no concept of
  "does this player currently hold the role that produced their historical
  games." Low-touch, high-ceiling players (Kenny Gainwell, backup RBs with
  one spike start) rank higher than their real role justifies. Flagged
  repeatedly across the session (Ray Davis, Gainwell, backup QBs after the
  15-game threshold drop) — same root cause each time, never fixed, would
  need a separate touches/game or snap-share signal feeding into the
  ranking, not just the raw point distribution.

## Output → schema mapping

Current Supabase schemas (see `web/supabase/migrations/`):

- `player_simulations` has real `floor`/`median`/`ceiling` numeric columns —
  direct fit for this engine's season-total output.
- `best_ball_rankings` / `redraft_rankings` currently only have `rank` +
  `notes` (no numeric projection columns). To display the actual weekly
  ceiling score, the weeks-15-17 playoff ceiling, or the weekly
  median/floor, those tables need new numeric columns added via a migration
  — not yet written.

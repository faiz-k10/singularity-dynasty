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

## Scripts in this directory

**Pipeline** (produce the `upload_*.csv` files that `web/scripts/publish-*.mjs`
push to Supabase):

| Script | Produces | Cadence |
|---|---|---|
| `projection_engine.R` | the core Monte Carlo projections (sims + redraft) | prototype — not yet the live source |
| `ceiling_range.R` | `upload_ceiling_range.csv` | with each sims refresh |
| `player_game_log.R` | `upload_player_game_log.csv` (+ ffopportunity xFP) | weekly, in season |

**Groundwork** (built, not wired into `projection_engine.R` yet — for Team Analysis):
`player_meta.R`, `age_curve_analysis.R`.

**Backtests & calibration** (`backtest_*.R`, `calibrate_*.R`) — run only when
validating a model change. Each is the evidence behind one decision recorded
below; the `*_results.rds` files next to them are cached run output. Not part
of the weekly pipeline.

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

## Bounce-back trigger (informational only — tried as a real adjustment, backtest said no)

A player whose most recent real game (week 18 excluded, see below) landed
at or below their own floor (`FLOOR_Q[pos]`, the same calibrated quantile
`floor` is published from) gets flagged (`bounceback` column, `BOUNCEBACK`
note on the published Redraft row, rendered as the trampoline badge on
the site). Explicit product choice: an exceptionally bad game — at or
below the number already published as this player's floor, not merely a
below-average one — is what's worth flagging as "due for a bounce back to
baseline." Was a flat 0.20 (bottom-20th-percentile) for every position
before; see the tighter-trigger check two paragraphs down for why moving
to FLOOR_Q isn't a step into the completely unvalidated.

Compared against the EXACT `floor` this row publishes (post QB-split,
post matchup-multiplier) -- not a separately-recomputed threshold.
The first version of this switch compared against a leave-one-out
quantile built from prior games only instead (principled -- keeps the
flagged game from defining its own bar), and that silently differed from
the published floor enough that it could flag a player whose actual game
beat the number shown as his floor, which is the one thing this badge
must never do (explicit product requirement). Comparing directly against
the published number is a hair less statistically pure (that one game is
part of the sample its own bar is drawn from) but it's what the badge
visibly means to someone reading the table, and it's informational only
regardless.

**The underlying pattern is real.** Checked every player-season 2018-2025
(min 10 games that season) for bottom-20th-percentile weeks (within that
player's own season), then tracked where they actually landed 1/2/3 games
later, in their own season's percentile terms — ~5,300 trigger events. A
true no-memory process would average exactly the 50th percentile next
game and repeat bottom-20% exactly 20% of the time. Real players instead
average somewhat above the 50th and repeat bottom-20% only 12-16% of the
time:

| | +1 game | +2 games | +3 games |
|---|---|---|---|
| Avg. next-game percentile | 54.5th | 55.9th | 56.6th |
| % land above median | 52.8% | 54.9% | 55.7% |
| % stay bottom-20% | 14.4% | 13.7% | 12.3% |

A tighter bottom-10th-percentile trigger was also checked and found to
give an almost identical aggregate lift (55.1/56.0/56.8) — a more extreme
bad week does NOT predict a bigger bounce, in aggregate. Per position it
does diverge: TE's reversion actually grows with the tighter trigger
(56.4/58.5/58.7), QB's *inverts* (fades from 56.7 at +1 back toward
neutral by +3, on a smaller n=212 sample), RB/WR look like scaled-up
versions of their 20%-trigger shape.

**Acting on it made predictions worse, not better.** The original plan
was to pull the weekly median from `BOUNCEBACK_MED_Q[pos]` (0.556 QB/TE,
0.548 WR, 0.529 RB) instead of the flat 0.50 whenever the trigger fired.
`backtest_bounceback_validation.R` walk-forward tested that directly —
same zero-lookahead discipline as every backtest here, scored by mean
absolute error against the real next game, baseline (flat 0.50) vs.
treatment (shifted quantile when triggered):

| | ALL games | Trigger-only games |
|---|---|---|
| Overall | +0.70% worse | +2.98% worse |
| QB | +0.96% worse | +4.18% worse |
| RB | +0.28% worse | +1.23% worse |
| WR | +0.81% worse | +3.29% worse |
| TE | +0.85% worse | +3.63% worse |

Worse across every position, worst for QB. **A real average-case pattern
doesn't automatically mean nudging every triggered player's single-point
prediction helps** — the players who don't bounce back apparently lose
more accuracy than the players who do gain, once you convert "the
average percentile is somewhat above 50th" into "move this one number
up." This is exactly the kind of gap the (now-removed) shrinkage
mechanism's own history already warned about (see "Shrinkage — removed
entirely" below): a real, correctly-measured pattern can still be the
wrong thing to act on point-by-point.

**So `med_q` stays 0.50 always** — the trigger detection and leave-one-out
threshold logic are unchanged and still exported as `bounceback` (and a
`BOUNCEBACK (informational only)` note on the published row), same
"surface it, don't act on it" treatment `trend` already gets. Kept
computed rather than deleted in case a differently-shaped adjustment
(smaller shift, floor/ceiling widening instead of a median shift,
something conditioned on more than just "was the last game bad") is
worth trying later — the parameter values and the negative result are
both on the record.

One more thing worth knowing if that's ever revisited: the FLOOR_Q
threshold itself (`fl`, what the recent game is compared against) is
still drawn from a player's **full recency-weighted history** (multiple
seasons, same `wm`/`MED_DECAY` basis as everything else here) — a
deliberate consistency choice ("a player's own distribution" means the
same thing everywhere in this file). Confirmed directly on Sam Darnold
(41 games, recent 6.1-point game): his career includes real single-digit
games from an earlier rough stretch, so 6.1 doesn't clear his own
leave-one-out 20th-percentile bar and `bounceback` stays `FALSE` for him.

**The game being checked, however, must be from `target_season`
specifically** (added once the 2026 season actually started) — the
"most recent real game" used to mean literally `x`'s last element, which
for every player is last season's final game until their own
`target_season` Week 1 has actually been played. That meant Week 1 2026
flagged 27 players as BOUNCEBACK purely off a bad game from 2025 — stale
history, not "you just had a bad week" in any sense a person looking at
the badge would mean. `had_bad_week` now filters to `target_season` rows
before taking the last one; a player with zero `target_season` games yet
is simply not eligible, no falling back to last season's number. The
`fl` threshold itself is untouched (still the full multi-season
distribution above) — only which game gets compared against it changed.

## Matchup-adjustment validation (real, but marginal and mixed by position)

`compute_matchup_multipliers()` scales floor/median/ceiling by an
opponent-strength multiplier (fantasy points allowed by that defense to
that position, shrunk toward 1.0 by sample size, capped to
[`MATCHUP_MULT_FLOOR`, `MATCHUP_MULT_CEIL`] = [0.90, 1.10]). This was
already live in the engine — despite an earlier version of this README
saying Redraft matchup-adjustment was "deferred, nothing in this engine
does that yet" — but unlike every other parameter here, it had never
been walk-forward validated.

`backtest_matchup_mult.R` closes that gap: for 2022-2025, weeks 2-17
(week 1 has no in-season defensive data yet, matching real production
behavior), reimplements the exact same formula but restricted to
already-elapsed weeks only (compute_matchup_multipliers() itself has no
week cutoff — correct for real-time use where future weeks simply don't
exist in the data yet, unsafe for backtesting past ones), then compares
each player's own weighted-quantile median with vs. without the
opponent multiplier applied, scored by MAE against the real result:

| | MAE change |
|---|---|
| Overall | −0.06% (essentially neutral) |
| QB | −0.44% (helps) |
| RB | −0.50% (helps) |
| WR | +0.18% (mildly hurts) |
| TE | +0.39% (mildly hurts) |

Not the clear win the file's other backtested parameters are, but not
the clear loss bounce-back turned out to be either — genuinely mixed,
small effects in both directions.

**Currently disabled in the published numbers (`APPLY_MATCHUP_MULTIPLIER
<- FALSE`), through roughly Week 4 of `TARGET_SEASON`.** The backtest
above is real, but it's scored against 2022-2025 with a full season of
defensive history behind every week being tested. `compute_matchup_
multipliers()` in live production doesn't have that luxury this early —
`defense_history_seasons()` is leaning on last season's defensive
numbers for a new season's early weeks, which the backtest never
actually measured (it always had in-season data to fall back on by week
2). Rather than assume the backtested result transfers to that
different, untested situation, `mult` is still computed and published
as-is (the `matchup_mult` column — powers the Opp column's heat tint on
the site, and is what a re-enable flips back on) but no longer multiplied
into `floor`/`median`/`ceiling`/the per-stat breakdown. Revisit once
`TARGET_SEASON` has enough of its own elapsed weeks to run this same
walk-forward check against real in-season defensive data instead of
last season's — expected around Week 4, not a fixed date.

## Sleeper-blend weekly median (real, validated, shipped on)

Direct instruction: given the matchup-adjustment result above only
barely earns its keep, and shrinkage was just removed for being too
subjective (see below), the better lever for a low-confidence week's
median is blending toward Sleeper's own published projection rather
than another home-grown adjustment.

`backtest_vs_sleeper.R` (extended with a blend-weight sweep for this)
gives the real answer, not a guess: 7,853 real player-weeks, both
completed seasons (2024 + 2025, weeks 3–17), `blended = w * ours + (1-w)
* Sleeper`, scored by MAE against real outcomes:

| w (ours) | QB | RB | WR | TE | OVERALL |
|---|---|---|---|---|---|
| 0.0 (pure Sleeper) | 6.655 | 4.406 | 4.530 | 3.664 | 4.530 |
| 0.3 | 6.419 | 4.386 | 4.484 | 3.632 | 4.474 |
| 0.4 | 6.388 | 4.395 | 4.482 | 3.632 | **4.473** |
| 0.5 | 6.378 | 4.415 | 4.487 | 3.638 | 4.480 |
| 1.0 (pure ours) | 6.666 | 4.659 | 4.628 | 3.765 | 4.661 |

Sleeper's own MAE beats "ours" outright at every position on this core
methodology (no matchup, no shrinkage — see the backtest's own header
comment). Blending isn't a marginal nudge here the way matchup-
adjustment was — every weight from 0.1 to 0.7 beats pure Sleeper on
overall MAE, and the best blend beats pure Sleeper by ~1.3% and pure
"ours" by ~4%. Best weight differs meaningfully by position, so
`SLEEPER_BLEND_WEIGHT` is per-position, not one flat constant:

| Position | Best w (ours) | 
|---|---|
| QB | 0.5 |
| RB | 0.2 (wants very little of our own signal) |
| WR | 0.4 |
| TE | 0.4 |

**Applies to the median only**, same scoping discipline as
`MED_MEAN_BLEND_SHARE` — the swept harness only tested the point
estimate, floor/ceiling stay pure `weighted_quantile()` of our own
distribution (Sleeper doesn't publish a range to blend those against
anyway). Fetched once per run (`fetch_sleeper_median_projections()`,
same place `compute_matchup_multipliers()` is), matched by
`normalized_name|position` the same way every other cross-source join in
this file works. Fails safe on both sides: a player Sleeper doesn't have
a projection for falls back to 100% our own number (not an error, not
excluded), and a total fetch failure falls back to `sleeper_med = NULL`
→ every player unblended, same as `APPLY_MATCHUP_MULTIPLIER`'s fail-safe
pattern.

**Real bug caught before shipping, worth a note on process:** the first
implementation checked the projection entry's top-level `position` field,
which is blank on Sleeper's real payloads — the actual position lives
under `player$position`. Silently produced zero matches (not an error,
just an empty result) until tested against live 2026 Week 2 data by
hand, which is exactly why this file's own discipline is "verify against
real data before trusting a fetch function," not just a clean parse.

**Honest caveat, not swept under the rug:** the backtest's "ours" is the
pure `weighted_quantile()` median, not the actual currently-published
median (which already includes the 85/15 `MED_MEAN_BLEND_SHARE` debias
blend just below). The two corrections likely overlap somewhat — both
exist to fix the same right-skew low-bias problem, one by blending
toward the mean, the other by blending toward Sleeper's own
expected-value-shaped numbers. This is real evidence honestly applied,
not a claim that `w=0.4` is exactly optimal against the full combined
stack; re-sweeping against the actual production median (post-debias)
would be the more precise version of this validation if it's ever
revisited.

**Unlike matchup-adjustment, this ships on by default**
(`APPLY_SLEEPER_BLEND <- TRUE`) — it's validated across two full real
seasons, not a partial-season situation the validation never actually
tested.

### No-Sleeper-projection = OUT (added after 2026 Week 2)

Sleeper leaves a player out of its projections when it knows he's out.
The blend's "no Sleeper projection -> 100% our own number" fallback (fine
for deep bench) therefore let real inactives through at full value in
Week 2 (Collins 17.1, Jacobs 13.7, Murray 14.9 ...) while nflreadr's
injury report missed them. Checked on real data: of 45 players we had at
>=5 pts with no Sleeper projection (Weeks 1-2), 44 recorded zero snaps.
`APPLY_SLEEPER_MISSING_OUT` now treats "no Sleeper projection AND our
median >= 3" as OUT (zeroed, "OUT" note), guarded by a minimum Sleeper
payload size. Scored on Week 2 with those players at 0: MAE 4.03 -> 2.98
vs Sleeper's 3.09 (hindsight-fitted on 2 weeks -- watch it in Week 3).

## QB weekly median: passing/rushing split

Every other position's weekly median is one `weighted_quantile()` call on
the blended `fantasy_points_ppr` column, one MED_DECAY value. QB is the
one position this file already admits the least confidence in (see
Recency weighting above: "QB's ceiling decay barely matters... don't
over-trust QB=0.98 as precisely correct") — and QB fantasy output is
genuinely bimodal in a way no other position's blended total is (a pure
pocket passer vs. a real rushing threat), which a single blended decay
can't represent well.

`backtest_qb_pass_rush_split.R` tests a fix: decompose QB scoring into
`pass_pts` (0.04/yard + 4/TD − 2/INT) and `rush_pts` (0.1/yard + 6/TD —
same standard-scoring constants `web/scripts/check-projection-math.mjs`
already treats as ground truth), sweep each component's own recency
decay independently (walk-forward, next-game MAE, same target as
MED_DECAY's own original backtest — NOT the season-total target
`backtest_stat_group_decay.R` uses):

| | Decay |
|---|---|
| Passing component | **0.79** |
| Rushing component | **0.88** |

Passing wants much faster decay than the blended 0.90 implied — passing
volume/efficiency apparently shifts within a season faster than one
blended number can track. Rushing's own optimum is close to the blended
value, meaning rushing was never really the mismatched half of QB
scoring — passing was.

**How the two components combine into one QB number went through three
real iterations, each backtested rather than assumed:**

1. Sum of two weighted MEANS — worked (−0.68% next-game MAE vs. the old
   blended quantile), but meant QB's "median" was a different statistic
   than every other position's (a mean, not a real percentile of a
   distribution).
2. Corrected to the 0.50 quantile of a resampled distribution instead —
   independently resample `n_sims` (pass-game, rush-game) pairs at each
   component's own decay (same per-stat-group resampling tradeoff the
   season `stat_ranges` split already accepts, see "Implementation
   detail worth knowing" under Stat-group season calibration), sum each
   pair, take the median. Fixed the consistency issue AND won by more,
   not less: **−1.07%**, stronger than attempt 1.
3. Real head-to-head against Sleeper's own published projections
   (2024-2025, ~7,850 real player-weeks across all positions,
   `backtest_mean_vs_median.R`/`backtest_error_measures.R`) surfaced
   something attempt 2 didn't test for: your model was biased low by
   about **−0.97 points at every position** — expected for a
   right-skewed stat (a median structurally sits below the mean for
   skewed data), and Sleeper's own numbers behave like an expected-value
   forecast, not a literal median. Switching QB specifically back to a
   mean — this time as an evidenced choice, not attempt 1's unconsidered
   first draft — won on **every measure** tested against Sleeper:

   | | Quantile (attempt 2) | Mean (final) |
   |---|---|---|
   | MAE | 6.676 | **6.489** |
   | RMSE | 8.442 | **8.211** |
   | Median abs. error | 5.736 | **5.656** |
   | Bias | −0.938 | **−0.549** |
   | Rank correlation vs. Sleeper | 0.264 | **0.282** |

   Not a tradeoff — every single measure improved. **RB/WR/TE were
   tested the identical way and did NOT win cleanly** switching to mean
   (bias and RMSE improved for them too, but MAE and median absolute
   error got measurably worse — a real cost, not obviously worth it), so
   they deliberately stay on the quantile-median path everywhere else in
   this file. QB's own "median" field is therefore not literally a
   median for this one position — that's an accepted, evidenced
   exception, not an inconsistency that slipped through.

**Scoped narrowly, on purpose:**
- **Median only.** Floor/ceiling keep the normal single blended-distribution
  `weighted_quantile()` path for every QB. Neither backtest above tested a
  floor/ceiling spread — extending an unvalidated change onto
  FLOOR_Q/CEIL_Q's own separate calibration isn't something this file
  does without evidence.
- **Every QB, thin-sample included.** Originally scoped to non-shrink-
  eligible QBs only, to avoid stacking this split on top of shrinkage's
  own separately-validated pool-blending for thin-sample players. Now
  applies universally — shrinkage itself is gone (see "Shrinkage —
  removed entirely" below), so there's nothing left to avoid stacking
  with.

## RB/WR/TE low-bias fix: 85/15 median/mean blend (shipped)

The Sleeper head-to-head (`backtest_error_measures.R` /
`backtest_mean_vs_median.R`) established that the model under-projects by
~0.98 pts/week at **every** position when it reports a pure
quantile-median — structural, because a median sits below the mean for a
right-skewed stat and Sleeper's numbers behave like an expected-value
forecast. QB was fixed by switching to a full mean (won on every
measure). RB/WR/TE were not: a full mean fixed their bias and RMSE but
made MAE and MedAE measurably worse — a real tradeoff.

`backtest_debias_blend.R` swept the middle ground on the same
~7,850-real-player-week harness: report
`share * weighted_median + (1 - share) * weighted_mean`, share ∈ {1.00 …
0.00}. **share = 0.85 is the corner** where the tradeoff disappears:

| share = 0.85 vs. pure median | RB | WR | TE |
|---|---|---|---|
| MAE | 4.637 → **4.626** | 4.645 → 4.642 | 3.778 → **3.773** |
| RMSE | 6.650 → **6.595** | 6.623 → **6.577** | 5.400 → **5.365** |
| MedAE | 3.110 → 3.108 | 3.247 → 3.268 | 2.593 → 2.630 |
| Bias | −0.968 → **−0.808** | −0.982 → **−0.805** | −0.982 → **−0.840** |
| Rank corr (within week) | 0.683 → **0.687** | 0.610 → **0.613** | 0.574 → **0.578** |

MAE flat-to-better, RMSE better at all three, within-week rank
correlation slightly better, bias roughly halved. MedAE gives back a
hair at WR/TE (~0.02 pt) — the only non-improvement, and far inside the
noise. Every alpha below 0.85 trades more MAE for more bias reduction;
0.85 is where you stop getting the bias win for free.

**Shipped** as `MED_MEAN_BLEND_SHARE = 0.85` in `projection_engine.R`,
in the weekly-median point estimate only:
- **RB/WR/TE, every player** — originally scoped to non-shrink players
  only for the same reason the QB split was; now universal, same as
  above (shrinkage is gone).
- **Median only.** Floor/ceiling stay pure `weighted_quantile()` at
  `FLOOR_Q`/`CEIL_Q` — the sweep never scored a floor/ceiling spread.
- **QB unaffected** — it already reports a full mean (share = 0.00 for
  QB was re-confirmed best in this same sweep).

Real-world effect on the 2026 wk-1 run: RB/WR/TE medians nudge up
~+0.11 pts on average (max single move 0.7), QB rows byte-identical.

## Removing "noisy" games from history — three tries, all rejected

Real motivating case: Jaylen Waddle's last game before an offseason trade
to Denver was 1 target, 0 receptions, 0.7 fantasy points — not a talent
signal, a 25% offensive-snap afterthought (confirmed via
`nflreadr::load_snap_counts()`, which carries real per-player-week
offensive snap percentage that `load_player_stats()` doesn't). That one
game nonetheless got the highest recency weight of his entire history and
dragged his median down hard. The idea: filter recency-decay history to
only games above 50% offensive snap share, so a meaningless afterthought
game like that one never enters the weighting to begin with — and unlike
the removed team-change detector, this doesn't need to know *why* a game
was low-involvement (trade, benching, injury return, garbage time), so it
generalizes past just team changes.

**First backtest looked like a clean win and was wrong.** Comparing
filtered-history predictions against unfiltered-history predictions by
building each side's own walk-forward evaluation points separately meant
the two methods were being scored against *different target games* — not
a fair test. That version showed QB improving 6.74% and RB/WR/TE getting
dramatically worse (RB +36%), which should have been the tell that
something was off in the test itself, not just the finding.

**Corrected test: same real target game either way, only the input
history differs.** Re-decayed per position on the filtered data first
(RB/WR/TE all wanted much flatter decay once filtered — 0.94-0.97 vs.
the original 0.87-0.92 — makes sense, once you've already removed the
noisy games there's less need to aggressively discount older ones), then
compared honestly:

| | Unfiltered (original) | Filtered (re-tuned decay) | Change |
|---|---|---|---|
| QB | 6.397 MAE | 6.616 MAE | worse |
| RB | 4.544 MAE | 6.882 MAE | **worse, badly (+51%)** |
| WR | 4.554 MAE | 5.554 MAE | worse |
| TE | 3.595 MAE | 4.408 MAE | worse |

Worse for every position once tested fairly — QB's apparent win evaporated
entirely once the target-game mismatch was fixed. Throwing out ~48% of
all player-games (the actual removal rate across the full raw player
universe) to filter out noise removes real signal along with it, and the
survivors are too thin and unrepresentative a sample to predict the
*actual* range of outcomes a player might have next — which still
includes low-snap weeks; those don't stop happening just because they're
excluded from training data.

**Fully reverted** — `load_history()` carries no snap-share filter, no
`MIN_SNAP_PCT`, no snap-counts join. `backtest_snap_filter_decay.R` (the
flawed first version) and `backtest_snap_filter_fair.R` (the corrected
one) are both kept in this directory for the record, same as every other
backtest script here, win or lose.

**Retried at a looser 30% cutoff** (`backtest_snap30_fair.R`) — removes
less of the data (30.3% of all games vs. 48% at 50%) and does less
damage, but the direction never flips: still worse for every position
(QB +2.80%, RB +30.82%, WR +14.59%, TE +8.63%). The trend as the
threshold loosens is toward parity with the unfiltered baseline, not
toward a win — evidence the real problem is discarding games at all
(a hard cutoff throws out real signal along with noise), not that 50%
specifically was too strict.

**Retried again, much more precisely targeted** — instead of any
low-snap game for any reason, only games with a CONFIRMED in-game injury
exit, parsed directly from play-by-play text ("TEAM-##-Player was
injured during the play" / "... has returned to the game" —
`backtest_injury_exit_filter.R`, resolved to real players via
season+team+jersey_number from `load_rosters()`). **Does NOT actually
catch Waddle's own motivating case** — checked directly, and his Week 17
game only has the "has returned to the game" half; the "was injured
during the play" onset event that game belongs to a different player
(MIA-3-K.Britt) entirely. Whatever actually happened to Waddle that game
wasn't tagged with that exact phrase in the play text this parser
matches on — a real coverage gap in the detector, not a data error. (An
earlier version of this note claimed his case was confirmed matched;
that was wrong and is corrected here.) Two exclusion definitions were
still tested on whatever the detector DOES catch (strict: injured AND
never returned; loose: any injury event that game) — both landed
near-neutral in aggregate (expected: only ~2.5-3% of all games are
injury-flagged at all, too rare to move an aggregate average much either
way). The real test is trigger-only —
`backtest_injury_exit_trigger_only.R`, scoped to exactly "the most
recent game before this prediction was injury-flagged" — and even there,
on the games the detector genuinely did catch, **excluding it was worse
for every position**: QB +4.32%, RB +3.72%, WR +2.55%, TE +0.55%. Not
neutral this time, actively worse, on the precise kind of case this was
built for — even setting aside that it missed Waddle's own game
specifically.

Three different formulations of "remove specific games from history" now
tried and rejected this session (bounce-back's point-adjustment, the
snap-share filter at two thresholds, and the injury-exit filter at two
definitions). The consistent lesson: even a game that looks obviously
non-representative still carries real predictive information, and
excluding it costs more sample than the noise-reduction is worth. Waddle's
underlying case is real and still unsolved by any of this — a
continuous/soft down-weighting by snap share (reduce a game's recency
weight in proportion to involvement, instead of a binary keep/discard)
is the more promising untried direction, since it wouldn't throw away
partial information the way every version tried so far does.

## Stat-group season calibration (touchdown/interception vs. yardage/volume)

The granular per-stat season projections (`stat_ranges` — Player Season
Simulations' per-stat floor/median/ceiling, e.g. rushing_tds, receiving_yards)
originally reused the single per-position `MED_DECAY` above for every stat
column that position carries, with a flat `quantile(0.10)`/`quantile(0.90)`
on the simulated distribution (no internal-quantile correction like
weekly figures get). Found to be wrong via a concrete case: Derrick
Henry's rushing-TD ceiling (27) and Jahmyr Gibbs' (17) both read as a flat
100th percentile against a comparison pool, traced back to the season sim
weighting recent games so heavily that one real 4-TD game (Week 17, 2025)
was contributing nearly half of Henry's entire projected season median by
itself.

**Backtested separately from MED_DECAY/CEIL_DECAY above, and against a
different target.** MED_DECAY/CEIL_DECAY are walk-forward validated
against *next-game weekly accuracy* (Redraft/Best Ball's actual use
case). This calibration is walk-forward validated against **real SEASON
TOTALS** instead — for each of 4 test seasons (2022-2025), simulate a
season using only the 3 seasons before it (same lookback
`history_seasons()` itself uses), score the resulting floor/median/
ceiling against what that player actually did that season. See
`backtest_stat_group_decay.R` (decay sweep, pinball loss) and
`calibrate_stat_group_quantiles.R` (internal-quantile sweep on the
winning decay, same concept as Floor/Ceiling internal q above, reusing
the already-simulated draws rather than resimulating per candidate).

**The stat split matters more than expected, and in the opposite
direction from the naive guess.** Touchdown/interception counts are
"lumpy" — most games are 0 even for a real scorer — so the instinct is
that a lumpy stat needs *more* reactivity to recent form. The backtest
says the reverse: TD/INT stats want **less** aggressive recency
weighting (decay closer to 1.0) than yardage does, because a single
recent game is a very noisy signal of a player's true scoring rate —
a stable estimate needs more history averaged in, not less. Yardage
accrues smoothly every game, so recent role/usage shifts there carry
real signal worth weighting up. Concretely, for every position the
backtested TD/INT decay is *higher* than the single blended decay
previously used — i.e. the old shared decay was already overweighting
recent games specifically for touchdowns, which is the exact mechanism
that inflated Henry's ceiling.

| Position | TD/INT decay | Yardage decay | TD/INT floor q | TD/INT ceil q | Yardage floor q | Yardage ceil q |
|---|---|---|---|---|---|---|
| QB | 0.97 | 0.82 | 0.016 | 0.96 | 0.0005 | 0.9965 |
| RB | 0.94 | 0.85 | 0.19 | 0.87 | 0.0005 | 0.994 |
| WR | 0.94 | 0.82 | 0.12 | 0.93 | 0.0005 | 0.9965 |
| TE | 0.97 | 0.94 | 0.17 | 0.82 | 0.0005 | 0.99 |

**TD/INT calibration is clean** — every value above is a genuine interior
optimum from the sweep, not pinned to a grid edge.

**Yardage/volume calibration does NOT fully close, and this is a real
finding, not a tuning miss.** Even after widening the internal-quantile
grid down to 0.0005 and up to 0.9995, no position reaches a true
10%/90% real-world exceed rate for yardage stats — best achieved is
~11-15% below-floor (target 10%) and ~9-10% above-ceiling. That ceiling
on how well this can be calibrated is structural: yardage totals are
driven by role (snap share, target share, offensive scheme), which can
shift completely between seasons in a way a same-player bootstrap has
no way to represent — it can only resample from games that player
actually had, never an outcome outside their own history (a promotion
to starter, a scheme change, a season-ending injury with no prior
precedent in their log). This is the same "role-stability" limitation
documented under Deferred below — this backtest just puts a number on
its cost (~40%/~17% miscalibrated before this fix, ~12%/~10% after,
still short of the 10%/10% target).

**Implementation detail worth knowing:** each stat-group now gets its
own resampling pass (its own weight vector), so correlation between
stats is preserved *within* a group (a big rushing-yards game and a big
receiving-yards game still land in the same simulated draw, both
"yardage") but not *across* groups (that same game's rushing-TD total
is now drawn separately under "td_int"'s own weighting). This is an
unavoidable tradeoff of the two stat types needing genuinely different
recency weighting — the previous single-pass design could preserve full
cross-stat correlation, but only by giving every stat the same
(measurably wrong) decay.

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
retuned three times this session (eligibility floor moved 30→20→15→8)
because lowering the games-required threshold changes which players enter
the backtest population and how much history each prediction is made from.
Decay values were stable across all three retunes (small single-decimal
shifts); the ceiling calibration quantile was not — it climbed
meaningfully at the 8-game floor (e.g. RB 0.94→0.96, TE 0.93→0.96) because
including very thin histories in the backtest pool makes small-sample tail
underestimation worse across the board. Don't assume future threshold
changes will be equally harmless — always retune, don't just truncate.

## Eligibility

`MIN_GAMES = 8`. Coverage of fantasy-relevant 2025 players: 72% at 30 games
→ 83% at 20 → 92% at 15 → **100% at 8**. This works because eligibility and
trust are now two separate knobs (see next section) — a player only needs 8
games to appear at all, but doesn't get treated as a fully independent
signal until 20.

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

## Shrinkage — removed entirely (was: workload tiering + shrinkage mechanism)

**Removed by direct product instruction: "too subjective."** The
mechanism blended a "context-flagged" player's own weighted history with
a positional baseline pool (`SHRINK_OWN_SHARE = 0.80`) whenever any of
several triggers fired (low sample size, not finishing the last
completed season, a team change). Each individual piece was defensible
on its own, but stacked together they added up to a lot of unbacktested,
by-hand judgment calls sitting on top of one another: which triggers
existed, the flat 80/20 split (hand-compared against 70/30/75/25/90/10,
picked by feel, never data-optimized), a manually chosen week-10
tail-absence cutoff, workload-tiering's 85th-percentile usage cutoff —
none of it individually backtested the way nearly everything else in
this file is. `projection_engine.R` no longer has any of it: no
`shrunk_quantile()`/`shrunk_mean()`/`build_common_pool()`, no trigger
logic, no baseline pools. Every player now goes through the exact same
unblended path (their own recency-weighted history only), including
QBs, who previously lost the validated pass/rush median split entirely
whenever they were shrink-eligible — QBs now always get that split
(nothing else about it changed; see "QB weekly median" below).

**What's kept:** the `LOW_SAMPLE_SHRINK_THRESHOLD = 20` game-count itself
survives as a purely objective `sample_confidence` label ("building"
below 20 games, "established" at or above) — no blending, just an honest
flag that a player's own history is thin. And `player_availability()`
(Player Season Simulations' season-total dampening for missed time) is
completely separate machinery, untouched by any of this.

**What's genuinely lost, worth knowing:** a player who didn't finish
their last completed season (James Conner: 3 games played in 2025, then
done for the year, but still reads as a normal healthy history) is no
longer discounted for that at the weekly level. And an established
player who switches teams gets no adjustment for the new context — same
as before this removal, actually (the team-change trigger was already
disabled going into this, `APPLY_TEAM_CHANGE_SHRINK <- FALSE`, over the
exact Jaylen-Waddle-style "can't tell a real role change from a
still-unproven one" concern).

**One real methodological lesson worth keeping on record even though the
code that taught it is gone:** the first shrinkage implementation
blended two RAW distributions together and then took a quantile of the
mixture — that does NOT reliably land between the two inputs' own
quantiles when one pool is sparse and lumpy. Verified concretely on Kenny
Gainwell: his own ceiling was 26.0, the baseline pool's ceiling was 23.1,
naive mixed-then-quantile produced **29.4** — higher than either input.
Correct fix was computing each side's quantile separately, then blending
the two numbers. **This directly matters for any future blending work**
(the Sleeper-projection blend discussed next) — the same failure mode
can recur any time two different sources get combined before deriving a
statistic from them, rather than deriving first and blending the
results.

## Age + draft-capital groundwork (data reconnaissance done, not wired in yet)

`player_meta.R` (`player_meta(seasons)`) and `age_curve_analysis.R` are
the setup pass for an age / draft-capital signal. Nothing in
`projection_engine.R` uses them yet — this is the "what does the age
cliff actually look like in the data" step before the feature is
designed.

**Data / join keys (nflreadr `load_rosters()` + `load_draft_picks()`):**
- `gsis_id` is the universal key — identical to
  `load_player_stats()$player_id`, so the model side needs **no name
  matching**. `sleeper_id` rides along for the website's `/my-team` join.
- Coverage for fantasy-relevant players (≥8-game seasons, 2010–2025):
  `birth_date` 100%, `sleeper_id` ~99%, `draft_round`/`pick` present for
  drafted players (`is_udfa` flags real undrafted vs. not-yet-known
  rookies). `age` is measured as of Sept 1 of the season.

**Age curves — longitudinal (same player, year N-1 → N, ≥8 g both
years; this controls for the survivorship that makes a naive
PPG-by-age plot slope *up* at old ages because only stars keep a job):**

| reaches age | RB Δ PPG/yr | WR Δ PPG/yr | TE Δ PPG/yr | QB Δ PPG/yr |
|---|---|---|---|---|
| 22–23 | **+0.8 to +1.5** | **+1.0 to +1.8** | +1.2 to +1.6 | ~+0.8 |
| 24–25 | −0.1 / −0.6 | +0.1 / +0.4 | +0.8 / +0.5 | ~flat |
| 26–27 | −0.4 / −0.8 | −0.4 / −0.3 | −0.1 / −0.6 | ~flat |
| 28 | −0.8 | −0.9 | −0.2 | ~flat |
| 29 | **−1.3** | −1.0 | −0.3 | ~flat |
| 30 | −1.0 | **−1.6** | −0.9 | ~flat |
| 31 | −1.7 | −0.6 | −0.8 | ~flat |
| 32 | **−2.8** | **−2.6** | −0.7 | small dip |

Takeaways: **RB declines from age 25, with a real acceleration at
29–30. WR is flat through 25, declines from 26, steepens past 30. TE
is the slow-aging position — growth through 25, gentle decline only
past 30. QB does not meaningfully age inside the fantasy window** (the
apparent "peak age 35" cross-sectional is pure survivorship) — an age
term should almost certainly be **QB-exempt**, same as the mean/median
split.

**Draft capital — early career only (`years_exp ≤ 1`, median PPG):**

| overall pick | RB | WR | TE |
|---|---|---|---|
| top 15 | 16.0 | 11.9 | 10.4 |
| 16–40 | 12.1 | 9.9 | 8.5 |
| 41–75 | 9.7 | 7.8 | 5.8 |
| 76–150 | 6.1 | 5.6 | 4.4 |
| 151+ / UDFA | ~4.4 | ~4.0 | ~2.0 |

A ~4× spread on draft position alone, for exactly the thin-sample
players who used to get blended toward a single positional baseline
regardless of pedigree, back when shrinkage existed (see "Shrinkage —
removed entirely" below — that mechanism, and the "make the baseline
pick-aware" idea this data reconnaissance was originally meant to
support, are both gone now). Left on record since the underlying data
still exists and could inform whatever eventually replaces shrinkage's
role for thin-sample players, e.g. the Sleeper-projection blend.

**Not started (waits on the use cases):** any change to
`projection_engine.R`, and the website-side `player_metadata` Supabase
table — its schema depends on what Team Analysis actually computes.

## Player game log — `player_game_log.R` (site feature, not a model change)

Feeds the `/my-team` "My Analysis" filter builder, not the projection
engine. `player_game_log.R` reads nflreadr's weekly player game log
(`load_player_stats`) joined to `load_schedules` (`result` = home
margin) over the **trailing two regular seasons** (`most_recent_season()`
and the one before) and writes **one row per player-week** to
`upload_player_game_log.csv`: season, week, opponent, `is_home`, `won`
(ties → FALSE), `fantasy_points_ppr`, `exp_points_ppr`, plus raw
component stats (receptions / targets / rec_yards / rush_yards / rush_att
/ pass_yards / tds) for future per-game metrics. `normalized_name`
matches `web/lib/portfolio.js` `normalizePlayerName`.

`exp_points_ppr` is **expected PPR fantasy points (xFP)** for that game
from `nflreadr::load_ff_opportunity(stat_type = "weekly")`
(`total_fantasy_points_exp`) — an opportunity model (targets, air yards,
carries, game situation) for what an average player would score in that
spot. Joined on GSIS `player_id` (== `load_player_stats$player_id`), so
the join is exact. Same 1-PPR basis as `fantasy_points_ppr`, so the
website plots `xFP/G`, `xFP Total` and points-over-expected
(`fantasy_points_ppr − exp_points_ppr`) per filter window. It's
ffopportunity **v1.0.0** (never retrained) and its automated data release
can lag mid-season; ~12% of player-weeks have no xFP row (cameos with no
modeled opportunity) and get NA — those drop out of the expected metrics
only.

Publish with `web/scripts/publish-player-game-log.mjs` (full
delete+reinsert into `player_game_log`, migrations `0027` + `0028`). The
website aggregates any window (home wins weeks 1–7, etc.) client-side via
`aggregateGames()`. Re-run whenever the weekly game log updates.
(Superseded the pre-aggregated `player_splits` approach — `0027` drops
that table.)

## Deferred — explicitly out of scope for now

- **Redraft matchup-adjustment** — built (`compute_matchup_multipliers()`,
  see "Matchup-adjustment validation" above) but currently disabled in
  the published numbers (`APPLY_MATCHUP_MULTIPLIER <- FALSE`) until
  there's enough of `TARGET_SEASON`'s own elapsed weeks to validate it
  against real same-season defensive data rather than leaning on last
  season's. Not the "nothing built yet" gap this bullet used to describe.
- **Role-stability / touch-volume signal — not mitigated at all,
  now that shrinkage is fully removed.** The model has no direct concept
  of "does this player currently hold the role that produced their
  historical games." Shrinkage's low-sample trigger used to catch this
  indirectly for genuinely thin-sample players (which is why it resolved
  the RJ Harvey case); with shrinkage gone entirely, there's no proxy for
  it left at all, for any player, at any sample size. A real touches/game
  or snap-share signal feeding directly into the ranking is still the
  more correct long-term fix — right now there's no adjustment and no
  manual escape hatch for this case, by design.

## Output → schema mapping

Current Supabase schemas (see `web/supabase/migrations/`):

- `player_simulations` has real `floor`/`median`/`ceiling` numeric columns —
  direct fit for this engine's season-total output.
- `redraft_rankings` has a `projection` numeric column (migration 0008) —
  direct fit for this engine's weekly `median`.
- `best_ball_rankings` has `ceiling_score` and `playoff_ceiling_score`
  numeric columns (migration 0009) — direct fit for this engine's weekly
  `ceiling` and `playoff_ceiling`.
- None of this is wired up as an actual publish step yet — `project_all()`
  writes `projections.csv` locally; turning that into formatted CSVs (or a
  direct write) per destination table is still a manual step.

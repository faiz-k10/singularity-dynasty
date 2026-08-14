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

## Workload tiering for shrinkage (all 4 positions)

The pool a shrunk player's projection blends toward excludes the top ~15%
by usage at their position — touches/game (carries+targets) for RB/WR/TE,
pass attempts/game for QB — so a limited-role player doesn't regress toward
a workhorse-level baseline. `build_common_pool()` is position-generic; the
underlying mechanism was originally built and validated for RB only (a
common-tier RB pool's median came out meaningfully lower than the full
pool's — 6.8 vs 8.5 PPG — while its right tail barely moved, 51.3 vs 55.4,
which is exactly the intended shape: a common-tier player can still
simulate a big game, they just don't regress toward workhorse-typical
production by default). Extended to QB/WR/TE afterward using the same
mechanism and cutoff percentile — that extension has **not** been
individually stress-tested against real players the way RB was.

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

**One trigger, applying to every position: low sample size.** Any player
with fewer than `LOW_SAMPLE_SHRINK_THRESHOLD = 20` games gets the
`SHRINK_OWN_SHARE = 0.80` blend applied, regardless of why their sample is
small. This is what actually resolved the RJ Harvey case (his 2025 volume
was driven by J.K. Dobbins' injury; Dobbins is healthy for 2026) —
games-played turned out to be a cheap, general-purpose proxy for exactly
the kind of role uncertainty a manual flag would otherwise be needed for.

**Two other triggers existed earlier this session and were both removed,
by the user's direct instruction:**

- **Team change** (automatic — comparing each player's most recent team
  against their current offseason team via `load_players()`).
- **Player-level manual flag** (`player_flags.csv`, one row per
  player/season/reason, for cases the low-sample trigger doesn't catch).
- Before either was removed, a third trigger — a manually maintained
  per-team OC/HC-change flag (`context_flags.csv`) — had *already* been
  removed for the same reason: every case it was meant to catch ended up
  covered by the low-sample trigger anyway.

**Real, current consequence of only having one trigger:** an established
player (25+ games) who switches teams — Kenny Gainwell's team change was
the original motivating case for building shrinkage in the first place,
before RJ Harvey — no longer gets any adjustment unless they also happen to
be under the low-sample threshold. Verified directly: Gainwell (47 games,
PIT→TB) now shows `shrunk = FALSE`. Team change alone is no longer a
signal this engine acts on.

**Severity was uniform across triggers when there were multiple** — the
user's call: the real distinguishing factor was "does this player have an
established personal track record at all," not the specific reason for a
flag, so every trigger used the same `SHRINK_OWN_SHARE = 0.80` rather than
different blend strengths. Now moot with only one trigger, but the
`shrunk_quantile()` mechanism itself is unaffected by any of this — same
math, just one caller left.

**A real bug found while extending this to all positions (still fixed,
though the code that used it — `detect_team_changes()` — was later
removed):** `load_player_stats()$team` and `load_players()$latest_team`
disagreed on exactly one team code — Arizona was `"ARI"` in one and `"AZ"`
in the other (confirmed the only mismatch across all 32 teams), which was
silently flagging every Arizona player as a false team change. Caught via
Trey McBride showing `shrunk = TRUE` despite 47 games and no real move.
Worth remembering if team-change detection is ever reintroduced.

## Deferred — explicitly out of scope for now

- **Redraft matchup-adjustment** (pace of play, offensive/defensive
  rankings). The live `/tools/redraft-rankings` page copy says
  "matchup-adjusted" — nothing in this engine does that yet. Real gap
  between current copy and current capability until this is built.
- **Role-stability / touch-volume signal — partially, not fully,
  mitigated, and less so now than earlier this session.** The model still
  has no direct concept of "does this player currently hold the role that
  produced their historical games." The under-20-games shrink trigger
  catches this indirectly for genuinely low-sample players (which is why
  it resolved the RJ Harvey case), but it's a proxy, not a fix — and with
  team-change detection and the manual per-player flag both removed, an
  established player (25+ games) whose role changes for *any* reason,
  including a straightforward team switch, gets no adjustment at all
  anymore. A real touches/game or snap-share signal feeding directly into
  the ranking is still the more correct long-term fix; right now there's
  no manual escape hatch for this case either, by design.

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

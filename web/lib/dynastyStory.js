// The words of a Dynasty Board profile (DynastyProfile.js), written the way a beat writer would tell it (founder, Nov 21 2026:
// "make the story flow ... as if a real person, NOT AN AI was telling this story for each player").
//
// The craft it follows, from feature writing:
//   - a LEDE that opens on the one fact about THIS player worth stopping for (a climb, a fall, his age against his rank, being
//     No. 1), not on a label;
//   - every chapter's last line hands off to the next one with "but" or "so", never "and then" (the "but / therefore" rule);
//   - concrete numbers and real names (the players he is tied with, his game count) instead of adjectives;
//   - plain contractions, sentence case, the player's last name after the first mention;
//   - none of the generated-text tics: no colons in headlines, no dashes for drama, no "not X, it's Y", no forced lists of three.
// Pure, so the wording is tested (test/dynastyStory.test.mjs).

const WORDS = ["", "top", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "11th", "12th"];
// "the fourth" for small numbers (how people say it), "No. 23" past that
const place = (n) => (n < WORDS.length ? `the ${WORDS[n]}` : `No. ${n}`);
// "the top", "the second-best", "No. 14" (plain "the second quarterback" reads like a backup)
const best = (n) => (n === 1 ? "the top" : n < WORDS.length ? `the ${WORDS[n]}-best` : `No. ${n}`);
const nth = (n) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n) => (n < NUM.length ? NUM[n] : String(n));
const POS = { QB: ["quarterback", "quarterbacks"], RB: ["running back", "running backs"], WR: ["receiver", "receivers"], TE: ["tight end", "tight ends"] };
const one = (pos) => POS[pos]?.[0] || pos;
const many = (pos) => POS[pos]?.[1] || `${pos}s`;
const last = (name) => {
  const w = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").split(" ");
  return w.length > 1 ? w.slice(1).join(" ") : name;
};
const yrs = (a) => a.toFixed(1).replace(/\.0$/, "");
const pts = (v) => v.toFixed(1);

// p: the scored row (name, pos, age, score, ppg, move, runway, prevRank). ctx:
//   rank / prev: his place in the list on screen now and nine games ago; scope: "on the board" or "among RBs"
//   overall, posRank: whole-board ranks in this view (may be null)
//   next / prevName: the player just below / above him in the list (for a No. 1 or a close call)
//   gapBelow: his score minus the next player's
//   group: group name; tierSize, tierPlace, mates: names of the others in his tier (nearest first)
//   repl: a replacement player's points a game here; above / games: games above it in his window
//   doneAge: the age his position usually falls off (never printed in the copy); rebuild: the mode reads only the next couple of seasons
//   viewLabel: "Superflex contender"; views: [{ label, rank }] for the four format x team-direction views (may be null). Contender / rebuilder
//   describes the TEAM, not the league (founder, Nov 23 2026), so the copy says "for a Superflex contender", never "in Superflex Contender leagues".
//   coach: { hc, calls } | null
export function dynastyStory(p, ctx) {
  const climb = ctx.prev ? ctx.prev - ctx.rank : 0;
  const young = p.runway >= 7, old = p.runway <= 1.5;

  // ---- lede: the one thing worth stopping for ----
  let lede;
  if (ctx.rank === 1 && ctx.next) {
    lede = ctx.gapBelow >= 0.5
      ? `${p.name} is the best player on this board, and ${last(ctx.next)} isn't especially close behind him.`
      : `${p.name} sits on top of this board, but only just. ${last(ctx.next)} is right on his heels.`;
  } else if (climb >= 5) {
    lede = `Half a season ago, ${p.name} was ${nth(ctx.prev)} ${ctx.scope}. He's ${nth(ctx.rank)} now.`;
  } else if (climb <= -5) {
    lede = `Half a season ago, ${p.name} was ${nth(ctx.prev)} ${ctx.scope}. He's slipped to ${nth(ctx.rank)}.`;
  } else if (old && ctx.rank <= 30) {
    lede = `${p.name} is ${yrs(p.age)} and still ranked ${nth(ctx.rank)} ${ctx.scope}. Age is the only thing working against him.`;
  } else if (young && ctx.rank <= 30) {
    lede = `${p.name} is ${yrs(p.age)}, and he's already ${best(ctx.posRank || ctx.rank)} ${one(p.pos)} on this board.`;
  } else if (p.ppg < ctx.repl) {
    lede = `${p.name} hasn't produced like a starter yet. He's on this board for what he could become.`;
  } else {
    lede = `${p.name} is ${best(ctx.posRank || ctx.rank)} ${one(p.pos)} on this board, ${ctx.overall ? `${nth(ctx.overall)} overall` : `${nth(ctx.rank)} ${ctx.scope}`}.`;
  }

  // ---- 1: what he's worth ----
  const worth = {
    head: ctx.overall
      ? `No. ${ctx.overall} overall and ${best(ctx.posRank)} ${one(p.pos)} for a ${ctx.viewLabel}`
      : `${ctx.group}, ${nth(ctx.rank)} ${ctx.scope}`,
    close: p.move == null
      ? `There aren't enough games yet to say which way he's heading. So the number rests on what he's done so far.`
      : Math.abs(p.move) < 1
        ? `His score has barely moved over the last half a season, so this is who he's been; here's where the number comes from:`
        : p.move > 0
          ? `He's added ${pts(p.move)} to that score over the last half a season, and he's still trending up; here's where it comes from:`
          : `The last half a season has taken ${pts(-p.move)} off that score; here's where it comes from:`,
  };

  // ---- 2: where it comes from ----
  const diff = Math.abs(p.ppg - ctx.repl);
  const pct = (a, n) => `${Math.round((100 * a) / n)}%`;
  const prod = {
    head: pts(diff) === pts(0) // within a rounding of replacement either way (founder, Nov 23 2026)
      ? `He's averaging ${pts(p.ppg)} a game, the same as a replacement-level ${one(p.pos)}.`
      : p.ppg >= ctx.repl
      ? `He scores ${pts(p.ppg)} a game. A replacement ${one(p.pos)} gives you ${pts(ctx.repl)}.`
      : `He's averaging ${pts(p.ppg)} a game, ${pts(diff)} under what a replacement ${one(p.pos)} gives you.`,
    // every player gets the share of starter-worthy weeks as a percentage (founder, Nov 23 2026)
    close: ctx.games
      ? ctx.above / ctx.games >= 0.75
        ? `He cleared that bar in ${ctx.above} of his last ${ctx.games} games. That's a starter-worthy week ${pct(ctx.above, ctx.games)} of the time, so the bad weeks are rare.`
        : ctx.above / ctx.games >= 0.45
          ? `He cleared that bar in ${ctx.above} of his last ${ctx.games} games. That's a starter-worthy week ${pct(ctx.above, ctx.games)} of the time.`
          : `Only ${ctx.above} of his last ${ctx.games} games cleared that bar. That's a starter-worthy week just ${pct(ctx.above, ctx.games)} of the time, so a few big weeks carry the average.`
      : null,
  };

  // ---- 3: how long it lasts ----
  // Only his age and what it means: the age his position falls off at is ours and is not printed (founder, Nov 23 2026).
  const he = `He's ${yrs(p.age)}`;
  const age = {
    head: ctx.rebuild && p.runway < 2
      ? (p.runway <= 0 ? `${he}. That's a problem for a rebuilder, because he's already past his best years.` : `${he}. That's a problem for a rebuilder, because his good years will likely be gone before your team is ready.`)
      : p.runway <= 0 ? `${he}. Whatever he gives you now is borrowed time.`
        : p.runway < 2 ? `${he}. Enjoy the points now, because they won't hold their value for long.`
          : p.runway < 5 ? `${he} and in his prime, with a few good seasons still to come.`
            : `${he}. The production you see now should have years left on it.`,
    close: null,
  };

  // ---- 4: who he's level with ----
  const m = ctx.mates || [];
  const tier = ctx.tierSize <= 1
    ? {
      head: `Nobody on the board is close enough to call even with him.`,
      close: `The gap to the next player is real, so you'd want a clear premium to move him.`,
    }
    : {
      head: ctx.tierSize > 6
        ? `He's one of ${ctx.tierSize} players the board can't pull apart.`
        : m.length === 1 ? `He's in a dead heat with ${m[0]}.` : `He's in a dead heat with ${m[0]} and ${count(ctx.tierSize - 2)} other${ctx.tierSize - 2 > 1 ? "s" : ""}.`,
      close: ctx.tierSize > 6
        ? `In a group that size the order is close to guesswork, so his spot inside it tells you less than it looks. ${m[0]} is the closest name to him.`
        : ctx.tierSize === 2
          ? `Having him ${ctx.tierPlace === 1 ? "ahead of" : "behind"} ${last(m[0])} is close to a coin flip. Either one could turn out to be the better player.`
          : `${ctx.tierPlace === 1 ? "Having him on top of" : `Ranking him ${place(ctx.tierPlace).replace(/^the /, "")} in`} that group is close to a coin flip. Any of them could turn out to be the better player.`,
    };

  // ---- 5: does the league change it ----
  let league = null;
  if (ctx.views?.length) {
    const ranks = ctx.views.map((v) => v.rank);
    const best = ctx.views.reduce((a, b) => (b.rank < a.rank ? b : a)), worst = ctx.views.reduce((a, b) => (b.rank > a.rank ? b : a));
    // partial: a free viewer can't see some views (past the free top 20), so don't claim anything about "every" format
    league = ctx.partial
      ? { head: `For a ${best.label} he's No. ${best.rank}. Explorer shows where he ranks in every view.` }
      : Math.min(...ranks) === Math.max(...ranks)
      ? { head: `He's No. ${best.rank} whatever your format and whichever way your team is headed.` }
      : Math.max(...ranks) - Math.min(...ranks) <= 3
        ? { head: `Your format and your team's direction barely move him, from No. ${best.rank} to No. ${worst.rank}.` }
        : { head: `For a ${best.label} he's No. ${best.rank}. For a ${worst.label} he's No. ${worst.rank}.` };
  }

  // ---- 6: who's around him ----
  const staff = p.team === "FA"
    ? { head: `He's a free agent right now, without a team.` }
    : ctx.coach
    ? { head: ctx.coach.calls ? `${ctx.coach.hc} is his head coach, and he calls the plays himself.` : `${ctx.coach.hc} is his head coach, but he does not call the plays.` }
    : { head: `The coaching picture around him isn't known yet.` };

  return { lede, worth, prod, age, tier, league, staff };
}

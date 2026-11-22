// The words of a Dynasty Board profile (DynastyProfile.js), written the way a beat writer would tell it (founder, Nov 21 2026:
// "make the story flow ... as if a real person, NOT AN AI was telling this story for each player").
//
// The craft it follows, from feature writing:
//   - a LEDE that opens on the one fact about THIS player worth stopping for (a climb, a fall, his age against his rank, being
//     No. 1), not on a label;
//   - a NUT line right after it that says what that means for your roster;
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
//   doneAge: the age his position usually falls off; rebuild: the mode reads only the next couple of seasons
//   viewLabel: "Superflex Contender"; views: [{ label, rank }] for the four league setups (may be null)
//   coach: { hc, calls } | null
export function dynastyStory(p, ctx) {
  const L = last(p.name);
  const climb = ctx.prev ? ctx.prev - ctx.rank : 0;
  const young = p.runway >= 7, old = p.runway <= 1.5;

  // ---- lede: the one thing worth stopping for ----
  let lede;
  if (ctx.rank === 1 && ctx.next) {
    lede = ctx.gapBelow >= 0.5
      ? `${p.name} is the best player on this board, and ${last(ctx.next)} isn't especially close behind him.`
      : `${p.name} sits on top of this board, but only just. ${last(ctx.next)} is right on his heels.`;
  } else if (climb >= 5) {
    lede = `Last week, ${p.name} was ${nth(ctx.prev)} ${ctx.scope}. He's ${nth(ctx.rank)} now.`;
  } else if (climb <= -5) {
    lede = `Last week, ${p.name} was ${nth(ctx.prev)} ${ctx.scope}. He's slipped to ${nth(ctx.rank)}.`;
  } else if (old && ctx.rank <= 30) {
    lede = `${p.name} is ${yrs(p.age)} and still ranked ${nth(ctx.rank)} ${ctx.scope}. Age is the only thing working against him.`;
  } else if (young && ctx.rank <= 30) {
    lede = `${p.name} is ${yrs(p.age)}, and he's already ${best(ctx.posRank || ctx.rank)} ${one(p.pos)} on this board.`;
  } else if (p.ppg < ctx.repl) {
    lede = `${p.name} hasn't produced like a starter yet. He's on this board for what he could become.`;
  } else {
    lede = `${p.name} is ${best(ctx.posRank || ctx.rank)} ${one(p.pos)} on this board, ${ctx.overall ? `${nth(ctx.overall)} overall` : `${nth(ctx.rank)} ${ctx.scope}`}.`;
  }

  // ---- nut: what that means for you ----
  const top = (ctx.overall || ctx.rank) <= 24;
  const nut = ctx.rebuild
    ? p.runway < 3 ? `For a rebuild, though, the timing is against him.`
      : top ? `For a rebuild, that makes him someone to build around.`
        : p.ppg < ctx.repl ? `For a rebuild, he's a bet on what's still to come.`
          : `For a rebuild, he's a useful piece with time on his side.`
    : p.ppg < ctx.repl ? `If you're trying to win now, he won't help much yet.`
      : top ? `If you're trying to win now, he's the kind of player you set a lineup around.`
        : ctx.group === "Replacement" ? `If you're trying to win now, he fills a spot in your lineup and little more.`
          : `If you're trying to win now, he's a starter you can count on most weeks.`;

  // ---- 1: what he's worth ----
  const worth = {
    head: ctx.overall
      ? `No. ${ctx.overall} overall and ${best(ctx.posRank)} ${one(p.pos)} in ${ctx.viewLabel} leagues`
      : `${ctx.group}, ${nth(ctx.rank)} ${ctx.scope}`,
    close: p.move == null
      ? `There aren't enough games yet to say which way he's heading. So the number rests on what he's done so far.`
      : Math.abs(p.move) < 1
        ? `His score has barely moved over his last nine games, so this is who he's been. Here's where the number comes from.`
        : p.move > 0
          ? `He's added ${pts(p.move)} to that score over his last nine games, and he's still trending up. Here's where it comes from.`
          : `But his last nine games have taken ${pts(-p.move)} off that score. Here's where it comes from.`,
  };

  // ---- 2: where it comes from ----
  const diff = Math.abs(p.ppg - ctx.repl);
  const prod = {
    head: p.ppg >= ctx.repl
      ? `He scores ${pts(p.ppg)} a game. A replacement ${one(p.pos)} gives you ${pts(ctx.repl)}.`
      : `He's averaging ${pts(p.ppg)} a game, ${pts(diff)} under what a replacement ${one(p.pos)} gives you.`,
    close: ctx.games
      ? ctx.above / ctx.games >= 0.75
        ? `He cleared that bar in ${ctx.above} of his last ${ctx.games} games, so the bad weeks are rare. But production only matters for as long as it lasts.`
        : ctx.above / ctx.games >= 0.45
          ? `He cleared that bar in ${ctx.above} of his last ${ctx.games} games. Some weeks he's a starter, some weeks he isn't. And the clock is running on all of it.`
          : `Only ${ctx.above} of his last ${ctx.games} games cleared that bar, so a few big weeks carry the average. Which makes how long he lasts matter even more.`
      : null,
  };

  // ---- 3: how long it lasts ----
  const age = {
    head: `${many(p.pos)[0].toUpperCase() + many(p.pos).slice(1)} usually fall off around ${ctx.doneAge}. He's ${yrs(p.age)}.`,
    close: ctx.rebuild && p.runway < 2
      ? (p.runway <= 0 ? `That's the problem for a rebuilder. He's already past it.` : `That's the problem for a rebuilder. His good years will likely be gone before your team is ready.`)
      : p.runway <= 0 ? `So whatever he gives you now is borrowed time.`
        : p.runway < 2 ? `So enjoy the points now. They won't hold their value for long.`
          : p.runway < 5 ? `So he's in his prime, with a few good seasons still to come.`
            : `So the production you see now should have years left on it.`,
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
        : `${ctx.tierPlace === 1 ? "Having him on top of" : `Ranking him ${place(ctx.tierPlace).replace(/^the /, "")} in`} that group is close to a coin flip. Any of them could turn out to be the better player.`,
    };

  // ---- 5: does the league change it ----
  let league = null;
  if (ctx.views?.length) {
    const ranks = ctx.views.map((v) => v.rank);
    const best = ctx.views.reduce((a, b) => (b.rank < a.rank ? b : a)), worst = ctx.views.reduce((a, b) => (b.rank > a.rank ? b : a));
    league = Math.min(...ranks) === Math.max(...ranks)
      ? { head: `He's No. ${best.rank} however your league is set up.`, close: `So the league settings don't change the call on ${L}.` }
      : Math.max(...ranks) - Math.min(...ranks) <= 3
        ? { head: `Your league setup barely moves him, from No. ${best.rank} to No. ${worst.rank}.`, close: `So the call on ${L} is the same almost anywhere.` }
        : { head: `In ${best.label} leagues he's No. ${best.rank}. In ${worst.label} leagues he's No. ${worst.rank}.`, close: `So check which kind of league you're in before you value ${L}.` };
  }

  // ---- 6: who's around him ----
  const staff = ctx.coach
    ? { head: ctx.coach.calls ? `${ctx.coach.hc} is his head coach, and he calls the plays himself.` : `${ctx.coach.hc} is his head coach, but someone else calls the plays.` }
    : { head: `The coaching picture around him isn't known yet.` };

  return { lede, nut, worth, prod, age, tier, league, staff };
}

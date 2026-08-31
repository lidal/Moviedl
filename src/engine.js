/**
 * TYPECAST — game engine.
 *
 * Pure, serialisable, DOM-free. Everything in here can run in Node, which is
 * what test/engine.test.mjs does. The UI layer never computes payouts itself;
 * it only renders what these functions return.
 */

/** Chip denominations the player can stake in a single round. */
export const CHIP_OPTIONS = [5, 10, 15, 25];

/** Total chips available for the whole puzzle. */
export const TOTAL_CHIPS = 100;

/**
 * Cap per round: a quarter of the bankroll.
 *
 * This is the direct answer to "I have to bet everything before the guessing
 * gets hard". At 50 a player who recognised the film emptied their stack in two
 * rounds and never met the part of the game that asks for precision. At 25 the
 * money is spread across the whole reveal by construction — four bets of 25
 * spends exactly the stack.
 *
 * The final round is exempt. Someone who passed all game because they never saw
 * a price worth taking should still be able to back the read they finally have.
 */
export const MAX_CHIPS_PER_ROUND = 25;

/**
 * The final round doubles the cap rather than removing it.
 *
 * Someone who never saw a price worth taking should be able to back the read
 * they finally have — but an uncapped final round let them bank the whole stack
 * on the easiest bet in the game (an unmoved line, the full cast revealed) for
 * a risk-free score. Half the stack keeps passing a real fallback without
 * making it a strategy.
 */
export const FINAL_ROUND_CAP = 50;

/**
 * The multiplier on a bet is 1, plus this per rating point your own money has
 * dragged the line.
 *
 * That is the entire scoring dial, and it says one thing: you are paid for the
 * difficulty you took on. Backing a side pushes the line away from it, so each
 * further bet on the same read is a harder call and pays accordingly.
 *
 *     R1  OVER 25 @ 6.85   ×1.00   +250
 *     R2  OVER 25 @ 7.35   ×1.72   +430
 *     R3  OVER 25 @ 7.65   ×2.44   +610
 *     R4  OVER 25 @ 8.15   ×3.16   +790
 *
 * Deliberately *not* keyed to the round number. A player who simply waits meets
 * the opening line with the whole cast revealed — the easiest bet in the game —
 * and paying them more for having reached round 5 would reward exactly the
 * passivity this is meant to discourage. Sit out four rounds and the fifth is
 * still ×1.00.
 */
export const TRAVEL_BONUS = 1.2;

export const ROUNDS = 5;

/** Cosmetic scale so the scoreboard reads in credits rather than chips. */
export const CREDITS_PER_CHIP = 10;

/**
 * Shape of a serialised game. Bump it whenever a saved game would replay wrong
 * under the current rules — storage reads this, so the two cannot drift apart.
 */
/**
 * Bumped for the fixed-odds-with-escalation rewrite: bet.weight is now a
 * function of travel alone, where the previous ("pay by margin") version also
 * folded in a per-round base and stored betPoints-shaped tickets. Both
 * versions happened to land on the same round() output for a fresh game, which
 * is exactly the kind of coincidence that lets a real incompatibility hide —
 * this got caught by inspection, not by a failing test.
 */
export const STATE_VERSION = 6;

/** Ratings live on a 1-10 scale; keep lines inside it. */
export const LINE_MIN = 1.05;
export const LINE_MAX = 9.95;

/**
 * Lines sit on a .x5 grid, so the smallest meaningful move is 0.10 — one whole
 * step to the next legal number. A 0.05 nudge would snap straight back to where
 * it started and the line would never move at all.
 *
 * It also means every gap opened by a reversal contains exactly one possible
 * rating per tick, which is what makes a middle worth chasing.
 */
export const LINE_TICK = 0.10;

/* ------------------------------------------------------------------ *
 * Actor volatility
 * ------------------------------------------------------------------ */

const VOLATILITY_TIERS = [
  { max: 0.70, tier: 'steady', label: 'STEADY', blurb: 'Picks are consistent. Trust the average.' },
  { max: 0.90, tier: 'mixed', label: 'MIXED', blurb: 'Mostly reliable, with the odd misfire.' },
  { max: 1.10, tier: 'swingy', label: 'SWINGY', blurb: 'Great films and bad ones, in quantity.' },
  { max: Infinity, tier: 'wildcard', label: 'WILDCARD', blurb: 'Tells you almost nothing. Good luck.' },
];

/** Bucket a career standard deviation into a human-readable tier. */
export function volatility(sd) {
  return VOLATILITY_TIERS.find((t) => sd < t.max);
}

/**
 * Reveal order: descending career volatility.
 *
 * Round 1 hands you the wildcard — the actor whose filmography runs from
 * masterpiece to direct-to-video and tells you almost nothing. Each round after
 * that the cast gets steadier, until round 5 gives you its most typecast
 * member, whose films cluster tightly enough to be worth something.
 *
 * So the evidence improves exactly as the payout decays. That is the whole
 * tension: the opening bet is close to a coin flip at triple stakes, and every
 * round after it is a running verdict on whether you should back it or bail.
 */
export function revealOrder(cast) {
  return [...cast].sort(
    (a, b) => b.sd - a.sd || b.credits - a.credits || a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ *
 * The line
 * ------------------------------------------------------------------ */

/**
 * Snap a rating to the nearest x.x5, so a line can never land exactly on a
 * one-decimal IMDb rating. No pushes, ever — every bet resolves.
 */
export function snapLine(raw) {
  const clamped = Math.min(LINE_MAX, Math.max(LINE_MIN, raw));
  return (Math.floor(clamped * 10) + 0.5) / 10;
}

/**
 * What the actors revealed *so far* imply: an inverse-variance weighted mean of
 * their career averages.
 *
 * Precision weighting is both the statistically correct way to pool noisy
 * estimates and thematically exact — it leans on the actors whose presence
 * predicts something and mostly ignores the wildcard. The player's job is to
 * decide whether this particular film beats or misses that baseline.
 *
 * Critically this only ever sees the revealed cast. A line priced off the whole
 * billing would quietly leak the actors the player has not met yet, which is
 * information the game has not earned the right to give away.
 */
export function consensus(revealed) {
  if (revealed.length === 0) return snapLine(5.5);

  let num = 0;
  let den = 0;
  for (const actor of revealed) {
    const w = 1 / (actor.sd * actor.sd);
    num += actor.avg * w;
    den += w;
  }
  return num / den;
}

/**
 * The posted line: what the visible cast implies, shifted by where the money
 * has gone.
 *
 * Two forces, deliberately kept separate. Each new actor repriuces the market —
 * that is casting news, and it is information the player can already see. On
 * top of that sits the pressure of the player's own bets, which is what makes
 * doubling down cost a worse number than turning around.
 */
export function lineFor(revealed, pressure = 0) {
  const base = Math.round(consensus(revealed) * 100);
  return snapLine((base + Math.round(pressure * 100)) / 100);
}

/**
 * How far the line moves after a bet.
 *
 * The book reacts to your money: back OVER and the line climbs, so doubling
 * down later costs you a worse number, while turning around and betting UNDER
 * now gets you a better one. A 50-chip bet moves the line three ticks — enough
 * that an early bet plus a late reversal can leave you *middled*, with both
 * tickets winning if the rating lands in the gap between them.
 */
export const PRESSURE_PER_CHIP = 0.024;

/**
 * How far a bet pushes the line, strictly proportional to the chips behind it.
 *
 * Quantising this to grid ticks looked harmless but was not: rounding made a
 * 15-chip bet buy 0.0267 of movement per chip against a 25-chip bet's 0.0240.
 * Since TRAVEL_BONUS pays per point moved, that made 15s an 11% cheaper way to
 * buy multiplier — a reason to pick a stake size that had nothing to do with
 * reading the film. The line itself is still snapped to the grid by lineFor;
 * only the pressure behind it stays continuous.
 *
 * The smallest legal stake still shifts the line at least one tick
 * (5 × 0.024 = 0.12 > 0.10), so no bet is ever swallowed by the grid.
 */
export function lineShift(chips) {
  return Math.round(chips * PRESSURE_PER_CHIP * 1000) / 1000;
}

/**
 * Accumulated pressure after a bet, in rating points.
 *
 * Tracked as a running total rather than folded into the line, so that the
 * market can reprice on new casting without losing the player's own footprint.
 */
export function addPressure(pressure, side, chips) {
  const delta = lineShift(chips) * (side === 'OVER' ? 1 : -1);
  return Math.round((pressure + delta) * 100) / 100;
}

/** Apply a bet's pressure directly to a line. Kept for readability in tests. */
export function moveLine(line, side, chips) {
  const delta = Math.round(lineShift(chips) * 100) * (side === 'OVER' ? 1 : -1);
  return snapLine((Math.round(line * 100) + delta) / 100);
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

/**
 * Build the starting state for a puzzle. `cast` must already be hydrated with
 * career stats (see data/index.js).
 */
export function createGame(puzzle, cast) {
  const order = revealOrder(cast);
  return {
    puzzleId: puzzle.id,
    version: STATE_VERSION,
    round: 0,
    pressure: 0,
    line: lineFor(order.slice(0, 1)),
    chipsLeft: TOTAL_CHIPS,
    bets: [],
    order: order.map((a) => a.name),
    status: 'playing',
  };
}

/** Actors the player has met by a given round. */
export function revealedBy(ordered, round) {
  return ordered.slice(0, Math.min(ordered.length, round + 1));
}

/** Chips the player may legally stake right now. */
export function maxStake(state) {
  const cap = state.round >= ROUNDS - 1 ? FINAL_ROUND_CAP : MAX_CHIPS_PER_ROUND;
  return Math.min(cap, state.chipsLeft);
}

/**
 * What a chip staked right now is multiplied by: the round's base, escalated by
 * how far this player's own betting has already dragged the line.
 */
export function effectiveWeight(travel = 0) {
  return 1 + TRAVEL_BONUS * Math.abs(travel);
}

/** The multiplier on offer this round, given the pressure already applied. */
export function currentWeight(state) {
  if (state.round >= ROUNDS) return 0;
  return effectiveWeight(state.pressure);
}

/** How far the player's own money has moved the line, in rating points. */
export function travelled(state) {
  return Math.abs(state.pressure ?? 0);
}

/** What a stake is worth if it wins (positive) or loses (negative). */
export function stakeSwing(chips, weight) {
  return Math.round(chips * weight * CREDITS_PER_CHIP);
}

/**
 * Move to the next round, repricing the line off the cast that will then be
 * visible plus whatever pressure the player has applied.
 *
 * Takes the cast in any order and derives the reveal order itself: a caller
 * handing over the raw billing would otherwise silently reprice against the
 * wrong actors, with nothing to show for it but a subtly wrong line.
 */
function advance(state, cast) {
  const ordered = revealOrder(cast);
  const round = state.round + 1;
  return {
    ...state,
    round,
    line: lineFor(revealedBy(ordered, round), state.pressure),
    status: round >= ROUNDS ? 'complete' : 'playing',
  };
}

/**
 * Stake `chips` on `side` at the currently posted line, then advance. Returns a
 * new state; never mutates.
 */
export function placeBet(state, side, chips, cast) {
  if (state.status !== 'playing') throw new Error('game is over');
  if (side !== 'OVER' && side !== 'UNDER') throw new Error(`bad side: ${side}`);
  if (!Number.isFinite(chips) || chips <= 0) throw new Error('stake must be positive');
  if (chips > maxStake(state)) throw new Error('stake exceeds the limit for this round');
  if (!Array.isArray(cast)) throw new Error('placeBet needs the cast to reprice the line');

  const bet = {
    round: state.round,
    side,
    chips,
    line: state.line,
    // Frozen at strike time: settlement must not re-price a ticket using
    // pressure the player applied after placing it.
    travel: travelled(state),
    weight: effectiveWeight(state.pressure),
  };

  return advance({
    ...state,
    bets: [...state.bets, bet],
    chipsLeft: state.chipsLeft - chips,
    pressure: addPressure(state.pressure, side, chips),
  }, cast);
}

/**
 * Sit the round out.
 *
 * This costs nothing but the round's weight. Round 1 in particular is often
 * genuinely unreadable — a dossier and one wildcard actor — and declining a
 * price you cannot evaluate is a legitimate move, not a failure.
 */
export function passRound(state, cast) {
  if (state.status !== 'playing') throw new Error('game is over');
  if (!Array.isArray(cast)) throw new Error('passRound needs the cast to reprice the line');
  return advance(state, cast);
}

/* ------------------------------------------------------------------ *
 * Settlement
 * ------------------------------------------------------------------ */

/**
 * Round so that a win and the identical loss are exact mirrors.
 *
 * Math.round breaks ties toward +∞, so a payout of 312.5 became +313 while the
 * same bet losing became −312. Tiny, but it made the game pay out fractionally
 * more than it took in, and broke the symmetry the scoreboard advertises.
 */
function roundHalfAwayFromZero(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Grade every ticket against the line it was actually struck at.
 *
 * A bet wins or loses its stake; the multiplier carries the reward. That works
 * here only because the line moves: a bet at the opening 6.4 is a trivial call
 * and pays ×1.00, while a bet at 8.15 — a line you pushed there yourself — is a
 * genuinely hard one and pays over three times as much. Take the harder bet and
 * you are paid for it.
 */
export function settle(state, rating) {
  const tickets = (state.bets ?? []).map((bet) => {
    const won = bet.side === 'OVER' ? rating > bet.line : rating < bet.line;
    const weight = bet.weight ?? effectiveWeight(bet.travel);
    const swing = Math.round(bet.chips * weight * CREDITS_PER_CHIP);
    return { ...bet, weight, won, payout: won ? swing : -swing };
  });

  const total = tickets.reduce((sum, t) => sum + t.payout, 0);
  const staked = tickets.reduce((sum, t) => sum + t.chips, 0);
  const wins = tickets.filter((t) => t.won).length;
  const boldest = tickets.reduce(
    (acc, t) => (acc === null || t.weight > acc.weight ? t : acc), null);

  return {
    tickets,
    total,
    staked,
    wins,
    losses: tickets.length - wins,
    hadAction: tickets.length > 0,
    boldest,
    middled: wins > 0 && wins === tickets.length && hasBothSides(tickets),
    grade: grade(total, tickets.length > 0),
  };
}

function hasBothSides(tickets) {
  return tickets.some((t) => t.side === 'OVER') && tickets.some((t) => t.side === 'UNDER');
}

/** Best and worst possible results, for context on the scoreboard. */
export function scoreBounds() {
  // Best case: ride one side for the whole stack and win every leg. Only an
  // extreme film allows it, but it bounds the scoreboard.
  let chips = TOTAL_CHIPS;
  let pressure = 0;
  let best = 0;
  for (let round = 0; round < ROUNDS && chips > 0; round++) {
    const cap = round >= ROUNDS - 1 ? FINAL_ROUND_CAP : MAX_CHIPS_PER_ROUND;
    const stake = Math.min(cap, chips);
    best += Math.round(stake * effectiveWeight(pressure) * CREDITS_PER_CHIP);
    pressure += lineShift(stake);
    chips -= stake;
  }
  return { best, worst: -best };
}

const GRADES = [
  { min: 1800, label: 'SHARP', note: 'You knew the number, not just the film.' },
  { min: 1000, label: 'CONFIDENT', note: 'Rode it and got off in time.' },
  { min: 400, label: 'IN PROFIT', note: 'Ground it out.' },
  { min: 1, label: 'SCRAPED BY', note: 'A win is a win.' },
  { min: 0, label: 'BROKE EVEN', note: 'Everything you won, you gave back.' },
  { min: -900, label: 'DOWN', note: 'You stopped before it got expensive.' },
  { min: -Infinity, label: 'TAKEN TO THE CLEANERS', note: 'You rode that one off a cliff.' },
];

export function grade(total, hadAction = true) {
  // Declining every price is a legitimate outcome, not a failure to participate.
  if (!hadAction) {
    return {
      label: 'NO BET',
      note: 'You never saw a price worth taking. That is a position too.',
    };
  }
  return GRADES.find((g) => total >= g.min);
}

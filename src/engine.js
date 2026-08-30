/**
 * TYPECAST — game engine.
 *
 * Pure, serialisable, DOM-free. Everything in here runs in Node, which is what
 * test/engine.test.mjs does. The UI never computes a payout itself; it only
 * renders what these functions return.
 */

/** Chip denominations the player can stake in a single round. */
export const CHIP_OPTIONS = [5, 10, 25, 50];

/** Total chips available for the whole puzzle. */
export const TOTAL_CHIPS = 100;

/**
 * Cap per round. Deliberately half the bankroll: you physically cannot spend
 * everything in one round, so at least one later decision — repeat your call,
 * or move it — always exists.
 */
export const MAX_CHIPS_PER_ROUND = 50;

/**
 * Conviction decay. A chip staked in round 1 swings the scoreboard three times
 * as hard as the same chip in round 5 — in both directions.
 *
 * Early chips are dearer because they are bought blind: the first actor
 * revealed is the least predictable one, and the picture only sharpens as the
 * weights fall away.
 */
export const ROUND_WEIGHTS = [3.0, 2.2, 1.6, 1.2, 1.0];

export const ROUNDS = ROUND_WEIGHTS.length;

/**
 * How far a call can miss and still break even, per round.
 *
 * This is the counterweight that keeps the weight decay honest. Later rounds
 * are strictly better informed — by round 5 you have seen the whole cast — so
 * without a rising bar, a late call would be near-free money and every player
 * would simply wait. Demanding more precision exactly as the evidence improves
 * keeps an early, generous-tolerance call worth making.
 *
 * A call inside its tolerance profits; at the tolerance it breaks even; at
 * twice the tolerance it loses the full stake.
 *
 * Calibrated against the slate rather than guessed. A player who simply accepts
 * the anchor the game offers averages roughly break-even in round 1 and a clear
 * loss by round 5, so coasting on the default is not a strategy; a player who
 * lands within 0.8 profits in every round, most of all early. See docs/BETTING.md.
 */
export const TOLERANCES = [2.00, 1.75, 1.50, 1.25, 1.00];

/** Cosmetic scale so the scoreboard reads in credits rather than chips. */
export const CREDITS_PER_CHIP = 10;

/**
 * Shape of a serialised game. Bump it whenever a saved game would replay wrong
 * under the current rules — storage reads this, so the two cannot drift apart.
 */
export const STATE_VERSION = 3;

/** Calls live on the rating scale, in the same 0.1 steps as a real rating. */
export const GUESS_MIN = 1.0;
export const GUESS_MAX = 10.0;
export const GUESS_STEP = 0.1;

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
 */
export function revealOrder(cast) {
  return [...cast].sort(
    (a, b) => b.sd - a.sd || b.credits - a.credits || a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ *
 * The consensus
 * ------------------------------------------------------------------ */

/** Snap a rating to the 0.1 grid every real rating sits on. */
export function snapGuess(raw) {
  const clamped = Math.min(GUESS_MAX, Math.max(GUESS_MIN, raw));
  return Math.round(clamped * 10) / 10;
}

/**
 * What the actors revealed *so far* imply, as an inverse-variance weighted mean
 * of their career averages.
 *
 * Precision weighting is both the right way to pool noisy estimates and
 * thematically exact: it leans on the actors whose presence actually predicts
 * something and mostly ignores the wildcard.
 *
 * Critically this only ever sees the revealed cast. An anchor computed over the
 * whole billing would quietly leak the actors the player has not met yet, which
 * is information the game has not earned the right to give away.
 */
export function consensus(revealed) {
  if (revealed.length === 0) return snapGuess((GUESS_MIN + GUESS_MAX) / 2);

  let num = 0;
  let den = 0;
  for (const actor of revealed) {
    const w = 1 / (actor.sd * actor.sd);
    num += actor.avg * w;
    den += w;
  }
  return snapGuess(num / den);
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

/** Build the starting state for a puzzle. `cast` must be hydrated with stats. */
export function createGame(puzzle, cast) {
  const order = revealOrder(cast);
  return {
    puzzleId: puzzle.id,
    version: STATE_VERSION,
    round: 0,
    chipsLeft: TOTAL_CHIPS,
    calls: [],
    order: order.map((a) => a.name),
    status: 'playing',
  };
}

/** Chips the player may legally stake right now. */
export function maxStake(state) {
  return Math.min(MAX_CHIPS_PER_ROUND, state.chipsLeft);
}

/** Weight multiplier for the current round. */
export function currentWeight(state) {
  return ROUND_WEIGHTS[state.round] ?? 0;
}

/** How far this round's call may miss and still break even. */
export function currentTolerance(state) {
  return TOLERANCES[state.round] ?? TOLERANCES[TOLERANCES.length - 1];
}

/** The most the current round can win or lose. */
export function stakeSwing(chips, weight) {
  return Math.round(chips * weight * CREDITS_PER_CHIP);
}

/**
 * Where the slider should sit when a round opens: your last call if you have
 * made one, otherwise what the revealed cast implies.
 *
 * Defaulting to your previous call means repeating it — backing your own read
 * again — is the zero-effort action, and moving off it is the deliberate one.
 */
export function openingGuess(state, revealed) {
  const last = state.calls[state.calls.length - 1];
  return last ? last.guess : consensus(revealed);
}

function advance(state) {
  const round = state.round + 1;
  return { ...state, round, status: round >= ROUNDS ? 'complete' : 'playing' };
}

/**
 * Commit to a rating with a stake behind it. Returns a new state; never
 * mutates.
 */
export function placeCall(state, guess, chips) {
  if (state.status !== 'playing') throw new Error('game is over');
  if (!Number.isFinite(guess)) throw new Error('call must be a number');
  if (guess < GUESS_MIN || guess > GUESS_MAX) throw new Error('call is off the rating scale');
  if (!Number.isFinite(chips) || chips <= 0) throw new Error('stake must be positive');
  if (chips > maxStake(state)) throw new Error('stake exceeds the limit for this round');

  const call = {
    round: state.round,
    guess: snapGuess(guess),
    chips,
    weight: ROUND_WEIGHTS[state.round],
    tol: TOLERANCES[state.round],
  };

  return advance({
    ...state,
    calls: [...state.calls, call],
    chipsLeft: state.chipsLeft - chips,
  });
}

/** Skip the round. Costs nothing but the weight, which never comes back. */
export function passRound(state) {
  if (state.status !== 'playing') throw new Error('game is over');
  return advance(state);
}

/* ------------------------------------------------------------------ *
 * Settlement
 * ------------------------------------------------------------------ */

/**
 * Accuracy, as a signed multiplier on the stake.
 *
 *   dead on          → +1      (the full stake, times the round weight)
 *   inside tolerance → between 0 and +1, linearly
 *   at tolerance     →  0      (break even)
 *   twice tolerance  → −1      (the full stake, lost)
 *   beyond that      → −1      (capped; a wild miss cannot cost more than a bad one)
 *
 * Linear rather than curved, because a player has to be able to look at the
 * band on the slider and know what a miss is worth without doing arithmetic.
 */
export function callScore(error, tolerance) {
  const raw = 1 - error / tolerance;
  return Math.min(1, Math.max(-1, raw));
}

/** Distance between a call and the truth, on the 0.1 grid, free of float dust. */
export function callError(guess, rating) {
  return Math.round(Math.abs(guess - rating) * 100) / 100;
}

/** Grade every call independently against the round it was made in. */
export function settle(state, rating) {
  const tickets = (state.calls ?? []).map((call) => {
    const error = callError(call.guess, rating);
    const score = callScore(error, call.tol);
    return {
      ...call,
      error,
      score,
      payout: Math.round(call.chips * call.weight * CREDITS_PER_CHIP * score),
      won: score > 0,
    };
  });

  const total = tickets.reduce((sum, t) => sum + t.payout, 0);
  const staked = tickets.reduce((sum, t) => sum + t.chips, 0);
  const wins = tickets.filter((t) => t.won).length;
  const best = tickets.reduce(
    (acc, t) => (acc === null || t.error < acc.error ? t : acc), null,
  );

  return {
    tickets,
    total,
    staked,
    wins,
    losses: tickets.length - wins,
    closest: best,
    bracketed: bracketed(tickets, rating),
    grade: grade(total, tickets.length > 0),
  };
}

/**
 * Did the player straddle the answer and profit on both sides?
 *
 * This is the slider's equivalent of middling a line: two calls placed either
 * side of the truth, both close enough to pay. It is what a genuine change of
 * mind looks like when it works, and it is worth calling out.
 */
function bracketed(tickets, rating) {
  const above = tickets.some((t) => t.won && t.guess > rating);
  const below = tickets.some((t) => t.won && t.guess < rating);
  return above && below;
}

/** Best and worst possible results, for context on the scoreboard. */
export function scoreBounds() {
  let chips = TOTAL_CHIPS;
  let best = 0;
  for (const weight of ROUND_WEIGHTS) {
    const stake = Math.min(MAX_CHIPS_PER_ROUND, chips);
    best += stakeSwing(stake, weight);
    chips -= stake;
  }
  return { best, worst: -best };
}

const GRADES = [
  { min: 2000, label: 'SHARP', note: 'The book is going to limit you.' },
  { min: 1000, label: 'CONFIDENT', note: 'Read it early, stuck with it.' },
  { min: 300, label: 'IN PROFIT', note: 'Ground it out.' },
  { min: 1, label: 'SCRAPED BY', note: 'A win is a win.' },
  { min: 0, label: 'BROKE EVEN', note: 'Everything you won, you gave back.' },
  { min: -800, label: 'DOWN', note: 'At least you hedged something.' },
  { min: -Infinity, label: 'TAKEN TO THE CLEANERS', note: 'Confident and wrong is expensive.' },
];

export function grade(total, hadAction = true) {
  if (!hadAction) return { label: 'NO ACTION', note: 'You sat on your hands all game.' };
  return GRADES.find((g) => total >= g.min);
}

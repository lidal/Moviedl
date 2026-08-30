/**
 * TYPECAST — game engine.
 *
 * Pure, serialisable, DOM-free. Everything in here can run in Node, which is
 * what test/engine.test.mjs does. The UI layer never computes payouts itself;
 * it only renders what these functions return.
 */

/** Chip denominations the player can stake in a single round. */
export const CHIP_OPTIONS = [5, 10, 25, 50];

/** Total chips available for the whole puzzle. */
export const TOTAL_CHIPS = 100;

/**
 * Cap per round. Deliberately half the bankroll: you physically cannot spend
 * everything in one round, so at least one later decision — double down, or
 * turn around and bet the other way — always exists.
 */
export const MAX_CHIPS_PER_ROUND = 50;

/**
 * Conviction decay. A chip staked in round 1 swings the scoreboard three times
 * as hard as the same chip in round 5 — in both directions.
 *
 * Early chips are dearer because they are bought blind: the first actor
 * revealed is the *least* predictable one, and the picture only sharpens as the
 * weights fall away. You are paid most for betting when you know least.
 */
export const ROUND_WEIGHTS = [3.0, 2.2, 1.6, 1.2, 1.0];

export const ROUNDS = ROUND_WEIGHTS.length;

/** Cosmetic scale so the scoreboard reads in credits rather than chips. */
export const CREDITS_PER_CHIP = 10;

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
 * Opening line: an inverse-variance weighted mean of the cast's career
 * averages.
 *
 * Precision weighting is both the statistically correct way to pool noisy
 * estimates and thematically exact — the market leans on the actors whose
 * presence actually predicts something, and mostly ignores the wildcard. The
 * player's job is to decide whether this particular film beats or misses the
 * baseline its cast implies.
 */
export function openingLine(cast) {
  let num = 0;
  let den = 0;
  for (const actor of cast) {
    const w = 1 / (actor.sd * actor.sd);
    num += actor.avg * w;
    den += w;
  }
  return snapLine(num / den);
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
export function lineShift(chips) {
  return LINE_TICK * Math.max(1, Math.round(chips / 16));
}

/**
 * Apply a bet's pressure to the line.
 *
 * Done in integer hundredths: a line is re-derived from every previous line,
 * so accumulated float error would eventually drift it off the .x5 grid and
 * reintroduce pushes.
 */
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
    version: 2,
    round: 0,
    line: openingLine(cast),
    chipsLeft: TOTAL_CHIPS,
    bets: [],
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

/** What a stake is worth if it wins (positive) or loses (negative). */
export function stakeSwing(chips, weight) {
  return Math.round(chips * weight * CREDITS_PER_CHIP);
}

function advance(state) {
  const round = state.round + 1;
  return { ...state, round, status: round >= ROUNDS ? 'complete' : 'playing' };
}

/**
 * Stake `chips` on `side` for the current round, then move the line and
 * advance. Returns a new state; never mutates.
 */
export function placeBet(state, side, chips) {
  if (state.status !== 'playing') throw new Error('game is over');
  if (side !== 'OVER' && side !== 'UNDER') throw new Error(`bad side: ${side}`);
  if (!Number.isFinite(chips) || chips <= 0) throw new Error('stake must be positive');
  if (chips > maxStake(state)) throw new Error('stake exceeds the limit for this round');

  const bet = {
    round: state.round,
    side,
    chips,
    line: state.line,
    weight: ROUND_WEIGHTS[state.round],
  };

  return advance({
    ...state,
    bets: [...state.bets, bet],
    chipsLeft: state.chipsLeft - chips,
    line: moveLine(state.line, side, chips),
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
 * Grade every ticket against the line it was actually struck at — not the
 * final line. That is what makes a reversal more than damage control: bet OVER
 * at 6.55 and UNDER at 6.85 and a true rating of 6.7 pays you twice.
 */
export function settle(state, rating) {
  const tickets = state.bets.map((bet) => {
    const won = bet.side === 'OVER' ? rating > bet.line : rating < bet.line;
    const swing = stakeSwing(bet.chips, bet.weight);
    return { ...bet, won, payout: won ? swing : -swing };
  });

  const total = tickets.reduce((sum, t) => sum + t.payout, 0);
  const staked = tickets.reduce((sum, t) => sum + t.chips, 0);
  const wins = tickets.filter((t) => t.won).length;

  return {
    tickets,
    total,
    staked,
    wins,
    losses: tickets.length - wins,
    middled: wins > 0 && wins === tickets.length && hasBothSides(tickets),
    grade: grade(total, tickets.length > 0),
  };
}

function hasBothSides(tickets) {
  return tickets.some((t) => t.side === 'OVER') && tickets.some((t) => t.side === 'UNDER');
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
  { min: -800, label: 'DOWN', note: 'The hedge saved you something.' },
  { min: -Infinity, label: 'TAKEN TO THE CLEANERS', note: 'Confident and wrong is expensive.' },
];

export function grade(total, hadAction = true) {
  if (!hadAction) return { label: 'NO ACTION', note: 'You sat on your hands all game.' };
  return GRADES.find((g) => total >= g.min);
}

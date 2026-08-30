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
 * Cap per round: half the bankroll, so you cannot spend everything in one move
 * and at least one later decision always exists.
 *
 * The final round is exempt. Someone who passed all game because they never saw
 * a price worth taking should still be able to back the read they finally have,
 * rather than being told the chips they carefully preserved are unusable.
 */
export const MAX_CHIPS_PER_ROUND = 50;

/**
 * Conviction decay — deliberately gentle.
 *
 * Early chips are worth more, because committing before the picture is clear
 * should count for something. But round 1 shows you a dossier and a single
 * wildcard actor: often there is genuinely nothing to know yet, and a steep
 * curve there rewards guessing rather than knowing. At ×2.0 against ×1.0 an
 * early read is worth double a late one, and skipping a round you cannot read
 * costs you something real without wrecking your day.
 */
export const ROUND_WEIGHTS = [2.0, 1.7, 1.4, 1.2, 1.0];

export const ROUNDS = ROUND_WEIGHTS.length;

/** Cosmetic scale so the scoreboard reads in credits rather than chips. */
export const CREDITS_PER_CHIP = 10;

/**
 * Shape of a serialised game. Bump it whenever a saved game would replay wrong
 * under the current rules — storage reads this, so the two cannot drift apart.
 */
export const STATE_VERSION = 4;

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
export function lineShift(chips) {
  return LINE_TICK * Math.max(1, Math.round(chips / 16));
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
  const cap = state.round >= ROUNDS - 1 ? Infinity : MAX_CHIPS_PER_ROUND;
  return Math.min(cap, state.chipsLeft);
}

/** Weight multiplier for the current round. */
export function currentWeight(state) {
  return ROUND_WEIGHTS[state.round] ?? 0;
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
    weight: ROUND_WEIGHTS[state.round],
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
    hadAction: tickets.length > 0,
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
  ROUND_WEIGHTS.forEach((weight, round) => {
    const cap = round >= ROUNDS - 1 ? chips : MAX_CHIPS_PER_ROUND;
    const stake = Math.min(cap, chips);
    best += stakeSwing(stake, weight);
    chips -= stake;
  });
  return { best, worst: -best };
}

const GRADES = [
  { min: 2000, label: 'SHARP', note: 'The book is going to limit you.' },
  { min: 1000, label: 'CONFIDENT', note: 'Read it early, stuck with it.' },
  { min: 300, label: 'IN PROFIT', note: 'Ground it out.' },
  { min: 1, label: 'SCRAPED BY', note: 'A win is a win.' },
  { min: 0, label: 'BROKE EVEN', note: 'Everything you won, you gave back.' },
  { min: -700, label: 'DOWN', note: 'The hedge saved you something.' },
  { min: -Infinity, label: 'TAKEN TO THE CLEANERS', note: 'Confident and wrong is expensive.' },
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

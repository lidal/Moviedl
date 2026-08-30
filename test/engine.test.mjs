import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHIP_OPTIONS, TOTAL_CHIPS, MAX_CHIPS_PER_ROUND, ROUND_WEIGHTS, ROUNDS, TOLERANCES,
  GUESS_MIN, GUESS_MAX,
  snapGuess, consensus, revealOrder, volatility, openingGuess,
  createGame, placeCall, passRound, maxStake, currentTolerance,
  callScore, callError, settle, scoreBounds, grade,
} from '../src/engine.js';
import { PUZZLES, hydrateCast, validateData } from '../src/data/index.js';
import { puzzleForDay, dayNumber } from '../src/daily.js';
import { shareText } from '../src/share.js';

const cast = (...specs) =>
  specs.map(([name, avg, sd, credits = 50]) => ({
    name, avg, sd, credits, min: avg - 2, max: avg + 2,
  }));

const FIXTURE = cast(
  ['Steady Sam', 7.0, 0.60],
  ['Mixed Mo', 6.5, 0.85],
  ['Swingy Sue', 6.0, 1.00],
  ['Wild Wanda', 5.5, 1.40],
  ['Even Eve', 6.8, 0.75],
);

const game = () => createGame(PUZZLES[0], FIXTURE);

/* ---------------- the anchor ---------------- */

test('guesses land on the same 0.1 grid as a real rating', () => {
  assert.equal(snapGuess(6.44), 6.4);
  assert.equal(snapGuess(6.46), 6.5);
  for (let i = 0; i < 500; i++) {
    const g = snapGuess(1 + Math.random() * 9);
    assert.equal(Math.round(g * 10), g * 10, `${g} is off the 0.1 grid`);
  }
});

test('guesses stay on the rating scale', () => {
  assert.equal(snapGuess(-40), GUESS_MIN);
  assert.equal(snapGuess(400), GUESS_MAX);
});

test('the round-1 anchor is exactly the opening actor’s career average', () => {
  const order = revealOrder(FIXTURE);
  assert.equal(consensus(order.slice(0, 1)), snapGuess(order[0].avg));
});

test('the anchor only ever sees actors already revealed', () => {
  // Regression: an anchor computed over the whole billing leaks the ratings of
  // actors the player has not met yet, handing over information the game has
  // not earned the right to give away.
  const order = revealOrder(FIXTURE);
  for (let shown = 1; shown <= order.length; shown++) {
    const revealed = order.slice(0, shown);
    const withHidden = [...revealed, ...cast(['Ringer', 9.9, 0.3])];
    assert.notEqual(
      consensus(withHidden), consensus(revealed),
      'a hidden actor must not be able to influence the anchor, and here one could',
    );
  }
});

test('the anchor leans on the predictable actors, not the wildcard', () => {
  const pair = cast(['Reliable', 8.0, 0.5], ['Erratic', 6.0, 1.5]);
  assert.ok(consensus(pair) > (8.0 + 6.0) / 2);
});

test('the anchor is defined even before anything is revealed', () => {
  const mid = consensus([]);
  assert.ok(mid >= GUESS_MIN && mid <= GUESS_MAX);
});

test('the slider opens on your last call once you have made one', () => {
  const order = revealOrder(FIXTURE);
  let g = game();
  assert.equal(openingGuess(g, order.slice(0, 1)), consensus(order.slice(0, 1)));

  g = placeCall(g, 8.4, 25);
  assert.equal(openingGuess(g, order.slice(0, 2)), 8.4,
    'repeating your own read should be the zero-effort action');
});

/* ---------------- scoring ---------------- */

test('a call pays on accuracy, breaks even at its tolerance, and caps its loss', () => {
  assert.equal(callScore(0, 2.0), 1);
  assert.equal(callScore(1.0, 2.0), 0.5);
  assert.equal(callScore(2.0, 2.0), 0);
  assert.equal(callScore(4.0, 2.0), -1);
  assert.equal(callScore(9.0, 2.0), -1, 'a wild miss cannot cost more than a bad one');
});

test('the score is symmetric either side of the truth', () => {
  for (const delta of [0.1, 0.5, 1.3, 2.6]) {
    assert.equal(callError(7.0 + delta, 7.0), callError(7.0 - delta, 7.0));
  }
});

test('error is free of floating-point dust', () => {
  assert.equal(callError(8.3, 8.1), 0.2);
  assert.equal(callError(6.1, 6.0), 0.1);
  assert.equal(callError(2.9, 7.7), 4.8);
});

test('the bar rises as the evidence improves', () => {
  for (let i = 1; i < TOLERANCES.length; i++) {
    assert.ok(TOLERANCES[i] < TOLERANCES[i - 1],
      'a later round must demand more precision, or waiting would be free');
  }
  assert.equal(TOLERANCES.length, ROUNDS);
});

test('for the same accuracy, committing earlier always pays more', () => {
  for (const error of [0, 0.4, 0.9, 1.4]) {
    const perRound = ROUND_WEIGHTS.map(
      (w, i) => w * callScore(error, TOLERANCES[i]),
    );
    for (let i = 1; i < perRound.length; i++) {
      assert.ok(perRound[i] < perRound[i - 1],
        `at error ${error}, round ${i + 1} paid at least as much as round ${i}`);
    }
  }
});

/* ---------------- placing calls ---------------- */

test('a fresh game starts with a full stack and no action', () => {
  const g = game();
  assert.equal(g.chipsLeft, TOTAL_CHIPS);
  assert.equal(g.round, 0);
  assert.equal(g.calls.length, 0);
  assert.equal(g.status, 'playing');
});

test('placing a call never mutates the previous state', () => {
  const g = game();
  const snapshot = structuredClone(g);
  placeCall(g, 7.2, 25);
  assert.deepEqual(g, snapshot);
});

test('a ticket records the round it was struck in', () => {
  const g = placeCall(game(), 7.25, 50);
  assert.equal(g.calls[0].guess, 7.3, 'the call is snapped to the grid');
  assert.equal(g.calls[0].weight, ROUND_WEIGHTS[0]);
  assert.equal(g.calls[0].tol, TOLERANCES[0]);
});

test('you cannot spend the whole stack in one round', () => {
  const g = game();
  assert.equal(maxStake(g), MAX_CHIPS_PER_ROUND);
  assert.throws(() => placeCall(g, 7.0, TOTAL_CHIPS), /exceeds/);
});

test('the round cap falls to whatever is left once the stack runs low', () => {
  let g = placeCall(game(), 7.0, 50);
  g = placeCall(g, 7.0, 25);
  assert.equal(maxStake(g), 25);
  assert.throws(() => placeCall(g, 7.0, 50), /exceeds/);
});

test('nonsense calls and stakes are rejected', () => {
  const g = game();
  assert.throws(() => placeCall(g, 0.4, 10), /rating scale/);
  assert.throws(() => placeCall(g, 11, 10), /rating scale/);
  assert.throws(() => placeCall(g, NaN, 10), /must be a number/);
  assert.throws(() => placeCall(g, 7, 0), /positive/);
  assert.throws(() => placeCall(g, 7, -5), /positive/);
});

test('the game ends after five rounds however they are spent', () => {
  let g = game();
  for (let i = 0; i < ROUNDS; i++) {
    assert.equal(g.status, 'playing');
    assert.equal(currentTolerance(g), TOLERANCES[i]);
    g = passRound(g);
  }
  assert.equal(g.status, 'complete');
  assert.throws(() => passRound(g), /over/);
  assert.throws(() => placeCall(g, 7, 10), /over/);
});

/* ---------------- settlement ---------------- */

test('early conviction is worth more — in both directions', () => {
  const early = settle({ calls: [{ round: 0, guess: 7.0, chips: 25, weight: 3.0, tol: 2.0 }] }, 7.0);
  const late = settle({ calls: [{ round: 4, guess: 7.0, chips: 25, weight: 1.0, tol: 1.0 }] }, 7.0);
  assert.ok(early.total > late.total, 'an early bullseye must pay more');

  const earlyMiss = settle({ calls: [{ round: 0, guess: 7.0, chips: 25, weight: 3.0, tol: 2.0 }] }, 2.0);
  const lateMiss = settle({ calls: [{ round: 4, guess: 7.0, chips: 25, weight: 1.0, tol: 1.0 }] }, 2.0);
  assert.ok(earlyMiss.total < lateMiss.total, 'an early miss must cost more');
});

test('straddling the answer with two calls pays both — the bracket', () => {
  const result = settle({
    calls: [
      { round: 0, guess: 7.4, chips: 25, weight: 3.0, tol: 2.0 },
      { round: 2, guess: 6.6, chips: 25, weight: 1.6, tol: 1.5 },
    ],
  }, 7.0);

  assert.equal(result.wins, 2, 'both calls sat within tolerance');
  assert.ok(result.bracketed, 'calls either side of the truth is a bracket');
});

test('two calls on the same side of the truth is not a bracket', () => {
  const result = settle({
    calls: [
      { round: 0, guess: 7.4, chips: 25, weight: 3.0, tol: 2.0 },
      { round: 1, guess: 7.2, chips: 25, weight: 2.2, tol: 1.75 },
    ],
  }, 7.0);
  assert.equal(result.wins, 2);
  assert.equal(result.bracketed, false, 'a bracket requires having called both sides');
});

test('repeating a call that is wrong compounds the damage', () => {
  const result = settle({
    calls: [
      { round: 0, guess: 8.5, chips: 50, weight: 3.0, tol: 2.0 },
      { round: 1, guess: 8.5, chips: 50, weight: 2.2, tol: 1.75 },
    ],
  }, 4.0);
  assert.equal(result.wins, 0);
  assert.ok(result.total < 0);
  for (const t of result.tickets) assert.equal(t.score, -1, 'both should bottom out');
});

test('the closest call is reported, whether or not it paid', () => {
  const result = settle({
    calls: [
      { round: 0, guess: 3.0, chips: 25, weight: 3.0, tol: 2.0 },
      { round: 1, guess: 6.9, chips: 25, weight: 2.2, tol: 1.75 },
    ],
  }, 7.0);
  assert.equal(result.closest.guess, 6.9);
  assert.equal(result.closest.error, 0.1);
});

test('sitting out the whole game is exactly zero, not a loss', () => {
  const result = settle({ calls: [] }, 7.0);
  assert.equal(result.total, 0);
  assert.equal(result.bracketed, false);
  assert.equal(result.closest, null);
  assert.equal(result.grade.label, 'NO ACTION');
});

test('the advertised score bounds are actually reachable', () => {
  const { best, worst } = scoreBounds();
  let g = game();
  while (g.status === 'playing' && maxStake(g) > 0) g = placeCall(g, 7.0, maxStake(g));
  assert.equal(settle(g, 7.0).total, best, 'five perfect calls should hit the ceiling');
  assert.equal(settle(g, 1.0).total, worst, 'five maximal misses should hit the floor');
  assert.equal(best, -worst, 'the game must be symmetric');
});

test('breaking even after real action reads differently from never betting', () => {
  assert.equal(grade(0, true).label, 'BROKE EVEN');
  assert.equal(grade(0, false).label, 'NO ACTION');
});

/* ---------------- reveal order ---------------- */

test('actors are revealed wildcard first, most-predictable last', () => {
  assert.deepEqual(revealOrder(FIXTURE).map((a) => a.name),
    ['Wild Wanda', 'Swingy Sue', 'Mixed Mo', 'Even Eve', 'Steady Sam']);
});

test('every film gets steadier as its rounds get cheaper', () => {
  for (const puzzle of PUZZLES) {
    const spreads = revealOrder(hydrateCast(puzzle)).map((a) => a.sd);
    for (let i = 1; i < spreads.length; i++) {
      assert.ok(spreads[i] <= spreads[i - 1], `${puzzle.id}: round ${i + 1} is less predictable`);
    }
  }
});

test('reveal order is stable and non-mutating', () => {
  const tied = cast(['Alpha', 6, 0.8, 10], ['Beta', 7, 0.8, 90]);
  assert.deepEqual(revealOrder(tied).map((a) => a.name),
    revealOrder([...tied].reverse()).map((a) => a.name));
  const original = [...FIXTURE];
  revealOrder(FIXTURE);
  assert.deepEqual(FIXTURE, original);
});

test('volatility tiers rise with spread', () => {
  assert.equal(volatility(0.5).tier, 'steady');
  assert.equal(volatility(0.8).tier, 'mixed');
  assert.equal(volatility(1.0).tier, 'swingy');
  assert.equal(volatility(1.4).tier, 'wildcard');
});

/* ---------------- data ---------------- */

test('the curated slate is internally consistent', () => {
  assert.deepEqual(validateData(), []);
});

test('no film hands the answer over in round 1, and none is unreachable', () => {
  for (const puzzle of PUZZLES) {
    const order = revealOrder(hydrateCast(puzzle));
    const opening = consensus(order.slice(0, 1));
    assert.ok(opening >= GUESS_MIN && opening <= GUESS_MAX, `${puzzle.id}: anchor off scale`);
    // The whole game is that films deviate from what their cast implies.
    assert.notEqual(opening, puzzle.rating, `${puzzle.id}: the opening anchor is the answer`);
  }
});

test('the slate is not one-sided', () => {
  // Films should miss their cast baseline in both directions, or the correct
  // play would just be "always guess lower than the anchor".
  const over = PUZZLES.filter(
    (p) => p.rating > consensus(revealOrder(hydrateCast(p)))).length;
  const share = over / PUZZLES.length;
  assert.ok(share > 0.25 && share < 0.75,
    `slate is biased: ${over}/${PUZZLES.length} rate above their opening anchor`);
});

/* ---------------- daily rotation ---------------- */

test('a day always maps to the same puzzle', () => {
  assert.equal(puzzleForDay(500).puzzle.id, puzzleForDay(500).puzzle.id);
  assert.equal(puzzleForDay(0).number, 1);
});

test('every film appears exactly once per pass through the slate', () => {
  const n = PUZZLES.length;
  for (const start of [0, n, n * 7]) {
    const ids = new Set();
    for (let d = start; d < start + n; d++) ids.add(puzzleForDay(d).puzzle.id);
    assert.equal(ids.size, n, `cycle at day ${start} repeated a film`);
  }
});

test('consecutive passes through the slate are shuffled differently', () => {
  const n = PUZZLES.length;
  const first = Array.from({ length: n }, (_, d) => puzzleForDay(d).puzzle.id);
  const second = Array.from({ length: n }, (_, d) => puzzleForDay(d + n).puzzle.id);
  assert.notDeepEqual(first, second);
});

test('negative day numbers do not crash the picker', () => {
  assert.ok(puzzleForDay(-3).puzzle.id);
});

test('the day number advances by one per calendar day, in local time', () => {
  const a = dayNumber(new Date(2026, 5, 10, 23, 59));
  const b = dayNumber(new Date(2026, 5, 11, 0, 1));
  assert.equal(b - a, 1);
  assert.equal(dayNumber(new Date(2026, 5, 10, 0, 0)), a);
});

/* ---------------- share card ---------------- */

test('the share card shows one square per round and never names the film', () => {
  const result = settle({
    calls: [
      { round: 0, guess: 7.0, chips: 25, weight: 3.0, tol: 2.0 },
      { round: 3, guess: 2.0, chips: 25, weight: 1.2, tol: 1.25 },
    ],
  }, 7.0);

  const squares = [...shareText(242, result).split('\n')[1]];
  assert.equal(squares.length, ROUNDS);
  assert.equal(squares[0], '🟩', 'a bullseye should read as a hit');
  assert.equal(squares[1], '⬛', 'a skipped round should read as skipped');
  assert.equal(squares[3], '🟥', 'a maximal miss should read as a loss');

  // A call that only just profits gets its own square, so a share card
  // distinguishes a confident read from a lucky scrape.
  const scraped = settle(
    { calls: [{ round: 2, guess: 8.3, chips: 25, weight: 1.6, tol: 1.5 }] }, 7.0);
  assert.ok(scraped.tickets[0].score > 0 && scraped.tickets[0].score < 0.5);
  assert.equal([...shareText(1, scraped).split('\n')[1]][2], '🟨');

  const text = shareText(242, result);
  for (const puzzle of PUZZLES) assert.ok(!text.includes(puzzle.title));
  assert.ok(!text.includes('7.0'), 'the share card must not leak the rating');
});

/* ---------------- persistence ---------------- */

test('a game saved mid-round comes back intact', async () => {
  // Regression: the engine's state version was bumped without updating the
  // check in storage, so every reload silently discarded the game in progress.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
  };

  const { saveGame, loadGame, clearGame } = await import('../src/storage.js');

  let g = placeCall(game(), 7.3, 25);
  saveGame(42, g);

  const restored = loadGame(42, g.puzzleId);
  assert.deepEqual(restored, g, 'the saved game must survive a round trip');

  assert.equal(loadGame(43, g.puzzleId), null, 'a different day must not resume');
  assert.equal(loadGame(42, 'some-other-film'), null, 'a different film must not resume');

  clearGame();
  assert.equal(loadGame(42, g.puzzleId), null, 'clearGame must drop the game');

  delete globalThis.localStorage;
});

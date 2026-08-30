import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHIP_OPTIONS, TOTAL_CHIPS, MAX_CHIPS_PER_ROUND, ROUND_WEIGHTS, ROUNDS,
  snapLine, consensus, lineFor, lineShift, moveLine, addPressure, revealOrder, revealedBy, volatility,
  createGame, placeBet, passRound, maxStake, settle, scoreBounds, grade,
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

/* ---------------- the line ---------------- */

test('a line can never land on a real rating, so nothing pushes', () => {
  for (let r = 10; r <= 100; r++) {
    const rating = r / 10;
    assert.notEqual(snapLine(rating), rating, `snapLine(${rating}) landed on the rating`);
  }
  // Fuzz the whole range too.
  for (let i = 0; i < 2000; i++) {
    const line = snapLine(1 + Math.random() * 9);
    assert.equal(Math.round(line * 100) % 10, 5, `${line} is not on the .x5 grid`);
  }
});

test('lines stay inside the 1-10 rating scale', () => {
  assert.ok(snapLine(-50) >= 1 && snapLine(-50) <= 10);
  assert.ok(snapLine(999) >= 1 && snapLine(999) <= 10);
});

test('the line is pulled toward the low-variance actors', () => {
  // Two actors, same distance from the midpoint, but one is far more reliable.
  const line = lineFor(cast(['Reliable', 8.0, 0.5], ['Erratic', 6.0, 1.5]));
  const naive = (8.0 + 6.0) / 2;
  assert.ok(line > naive, `expected precision weighting to pull above ${naive}, got ${line}`);
});

test('the line only ever sees actors already revealed', () => {
  // Regression: a line priced off the whole billing leaks the ratings of actors
  // the player has not met yet.
  const order = revealOrder(FIXTURE);
  for (let shown = 1; shown <= order.length; shown++) {
    const revealed = order.slice(0, shown);
    const withRinger = [...revealed, ...cast(['Ringer', 9.9, 0.3])];
    assert.notEqual(consensus(withRinger), consensus(revealed),
      'a hidden actor must not be able to move the posted line, and here one could');
  }
});

test('the line reprices as each new name lands, independently of any betting', () => {
  const order = revealOrder(FIXTURE);
  let g = createGame(PUZZLES[0], FIXTURE);
  assert.equal(g.line, lineFor(order.slice(0, 1)), 'round 1 prices off the opening actor alone');

  const seen = [g.line];
  for (let i = 0; i < 3; i++) {
    g = passRound(g, FIXTURE);
    assert.equal(g.line, lineFor(revealedBy(order, g.round), 0),
      'passing must still reprice on the newly revealed actor');
    seen.push(g.line);
  }
  assert.ok(new Set(seen).size > 1, 'the line should actually move as the cast lands');
});

test('backing a side moves the line against that side', () => {
  assert.ok(moveLine(6.55, 'OVER', 50) > 6.55);
  assert.ok(moveLine(6.55, 'UNDER', 50) < 6.55);
  assert.equal(moveLine(6.55, 'OVER', 50), 6.85);
  assert.equal(moveLine(6.55, 'UNDER', 50), 6.25);
});

test('bigger stakes move the line further, and every stake moves it at least a tick', () => {
  const shifts = CHIP_OPTIONS.map(lineShift);
  for (const s of shifts) assert.ok(s >= 0.05, 'every bet must move the line');
  for (let i = 1; i < shifts.length; i++) {
    assert.ok(shifts[i] >= shifts[i - 1], 'shift must be monotonic in stake size');
  }
});

test('every legal bet actually moves the line off its current number', () => {
  // Regression: with lines on a .x5 grid, a sub-tick shift snapped straight
  // back to the number it started on and the book never reacted at all.
  for (let hundredths = 105; hundredths <= 995; hundredths += 10) {
    const line = hundredths / 100;
    for (const side of ['OVER', 'UNDER']) {
      for (const chips of CHIP_OPTIONS) {
        const moved = moveLine(line, side, chips);
        const clamped = side === 'OVER' ? line >= 9.95 : line <= 1.05;
        if (clamped) continue;
        assert.notEqual(moved, line, `${side} ${chips} left the line at ${line}`);
        assert.equal(side === 'OVER' ? moved > line : moved < line, true,
          `${side} ${chips} moved the line the wrong way from ${line}`);
      }
    }
  }
});

test('line movement survives repeated application without float drift', () => {
  let line = 6.55;
  for (let i = 0; i < 40; i++) {
    line = moveLine(line, i % 2 ? 'UNDER' : 'OVER', 25);
    assert.equal(Math.round(line * 100) % 10, 5, `drifted off the grid at ${line}`);
  }
});

/* ---------------- reveal order ---------------- */

test('actors are revealed wildcard first, most-predictable last', () => {
  const order = revealOrder(FIXTURE).map((a) => a.name);
  assert.deepEqual(order, ['Wild Wanda', 'Swingy Sue', 'Mixed Mo', 'Even Eve', 'Steady Sam']);
});

test('every film gets steadier as its rounds get cheaper', () => {
  // The evidence must improve monotonically while the weights fall away; if a
  // film revealed a wildcard late it would be handing out free information at
  // a discount.
  for (const puzzle of PUZZLES) {
    const spreads = revealOrder(hydrateCast(puzzle)).map((a) => a.sd);
    for (let i = 1; i < spreads.length; i++) {
      assert.ok(spreads[i] <= spreads[i - 1],
        `${puzzle.id}: round ${i + 1} (σ${spreads[i]}) is less predictable than round ${i} (σ${spreads[i - 1]})`);
    }
    assert.ok(ROUND_WEIGHTS[0] > ROUND_WEIGHTS[ROUND_WEIGHTS.length - 1],
      'weights must fall as the evidence improves');
  }
});

test('reveal order is stable for actors with identical volatility', () => {
  const tied = cast(['Alpha', 6, 0.8, 10], ['Beta', 7, 0.8, 90]);
  assert.deepEqual(revealOrder(tied).map((a) => a.name), revealOrder([...tied].reverse()).map((a) => a.name));
});

test('revealOrder does not mutate the cast it is given', () => {
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

/* ---------------- betting ---------------- */

test('a fresh game starts with a full stack and no action', () => {
  const g = createGame(PUZZLES[0], FIXTURE);
  assert.equal(g.chipsLeft, TOTAL_CHIPS);
  assert.equal(g.round, 0);
  assert.equal(g.bets.length, 0);
  assert.equal(g.status, 'playing');
});

test('placing a bet never mutates the previous state', () => {
  const a = createGame(PUZZLES[0], FIXTURE);
  const snapshot = structuredClone(a);
  placeBet(a, 'OVER', 25, FIXTURE);
  assert.deepEqual(a, snapshot);
});

test('a ticket records the line it was struck at, not the line that follows', () => {
  const g = createGame(PUZZLES[0], FIXTURE);
  const struck = g.line;
  const after = placeBet(g, 'OVER', 50, FIXTURE);
  assert.equal(after.bets[0].line, struck);
  assert.notEqual(after.line, struck);
});

test('you cannot spend the whole stack in one round', () => {
  const g = createGame(PUZZLES[0], FIXTURE);
  assert.equal(maxStake(g), MAX_CHIPS_PER_ROUND);
  assert.throws(() => placeBet(g, 'OVER', TOTAL_CHIPS, FIXTURE), /exceeds/);
});

test('the round cap falls to whatever is left once the stack runs low', () => {
  let g = createGame(PUZZLES[0], FIXTURE);
  g = placeBet(g, 'OVER', 50, FIXTURE);
  g = placeBet(g, 'OVER', 25, FIXTURE);
  assert.equal(maxStake(g), 25);
  assert.throws(() => placeBet(g, 'OVER', 50, FIXTURE), /exceeds/);
});

test('bad stakes and sides are rejected', () => {
  const g = createGame(PUZZLES[0], FIXTURE);
  assert.throws(() => placeBet(g, 'SIDEWAYS', 10, FIXTURE), /bad side/);
  assert.throws(() => placeBet(g, 'OVER', 0, FIXTURE), /positive/);
  assert.throws(() => placeBet(g, 'OVER', -5), /positive/);
  assert.throws(() => placeBet(g, 'OVER', NaN, FIXTURE), /positive/);
});

test('the game ends after five rounds however they are spent', () => {
  let g = createGame(PUZZLES[0], FIXTURE);
  for (let i = 0; i < ROUNDS; i++) {
    assert.equal(g.status, 'playing');
    g = passRound(g, FIXTURE);
  }
  assert.equal(g.status, 'complete');
  assert.throws(() => passRound(g, FIXTURE), /over/);
  assert.throws(() => placeBet(g, 'OVER', 10, FIXTURE), /over/);
});

/* ---------------- settlement ---------------- */

test('early conviction is worth more — in both directions', () => {
  const early = settle(
    { bets: [{ round: 0, side: 'OVER', chips: 25, line: 6.55, weight: ROUND_WEIGHTS[0] }] }, 8.0);
  const late = settle(
    { bets: [{ round: 4, side: 'OVER', chips: 25, line: 6.55, weight: ROUND_WEIGHTS[4] }] }, 8.0);
  assert.ok(early.total > late.total, 'an early win must pay more');

  const earlyLoss = settle(
    { bets: [{ round: 0, side: 'OVER', chips: 25, line: 6.55, weight: ROUND_WEIGHTS[0] }] }, 3.0);
  const lateLoss = settle(
    { bets: [{ round: 4, side: 'OVER', chips: 25, line: 6.55, weight: ROUND_WEIGHTS[4] }] }, 3.0);
  assert.ok(earlyLoss.total < lateLoss.total, 'an early loss must cost more');
  assert.equal(earlyLoss.total, -earlyLoss.staked * ROUND_WEIGHTS[0] * 10);
});

test('betting both ways around the rating pays twice — the middle', () => {
  const result = settle({
    bets: [
      { round: 0, side: 'OVER', chips: 25, line: 6.55, weight: 3.0 },
      { round: 2, side: 'UNDER', chips: 25, line: 6.85, weight: 1.6 },
    ],
  }, 6.7);

  assert.equal(result.wins, 2, 'both sides should win when the rating lands in the gap');
  assert.equal(result.losses, 0);
  assert.ok(result.middled);
  assert.equal(result.total, 25 * 3.0 * 10 + 25 * 1.6 * 10);
});

test('a reversal that misses the gap loses exactly one leg', () => {
  const result = settle({
    bets: [
      { round: 0, side: 'OVER', chips: 25, line: 6.55, weight: 3.0 },
      { round: 2, side: 'UNDER', chips: 25, line: 6.85, weight: 1.6 },
    ],
  }, 7.5);
  assert.equal(result.wins, 1);
  assert.equal(result.losses, 1);
  assert.equal(result.middled, false);
});

test('a reversal struck on the far side of the original middles the line', () => {
  // Settlement property, independent of how the lines got there: two tickets
  // either side of the rating both cash.
  for (const [first, second, lo, hi] of [
    ['OVER', 'UNDER', 6.55, 6.85],
    ['UNDER', 'OVER', 6.85, 6.55],
  ]) {
    const result = settle({
      bets: [
        { round: 0, side: first, chips: 25, line: lo, weight: 2.0 },
        { round: 2, side: second, chips: 25, line: hi, weight: 1.4 },
      ],
    }, 6.7);
    assert.equal(result.wins, 2, `${first} ${lo} then ${second} ${hi} should both cash on 6.7`);
    assert.ok(result.middled);
  }
});

test('your own money always moves the line away from the side you backed', () => {
  // Pressure alone is still monotone: doubling down pays a worse number, and
  // turning around gets a better one. This is what makes a hedge worth taking.
  let pressure = 0;
  for (const chips of CHIP_OPTIONS) {
    const up = addPressure(pressure, 'OVER', chips);
    const down = addPressure(pressure, 'UNDER', chips);
    assert.ok(up > pressure, 'backing OVER must push the line up');
    assert.ok(down < pressure, 'backing UNDER must push the line down');
    pressure = up;
  }
});

test('casting news can move the line through an open position, and it is visible', () => {
  // Consequence of pricing off the revealed cast: between rounds the line
  // reprices on the new name, which can carry it past a bet already struck.
  // A hedge is therefore no longer guaranteed to middle — but every ticket
  // records the line it was struck at, so the player can always see it.
  const swing = [
    { name: 'Wildcard', avg: 5.0, sd: 1.40, credits: 50, min: 3, max: 7 },
    { name: 'Prestige', avg: 8.5, sd: 0.50, credits: 50, min: 7, max: 9 },
    { name: 'Filler A', avg: 6.0, sd: 0.90, credits: 50, min: 4, max: 8 },
    { name: 'Filler B', avg: 6.0, sd: 0.80, credits: 50, min: 4, max: 8 },
    { name: 'Filler C', avg: 6.0, sd: 0.70, credits: 50, min: 4, max: 8 },
  ];

  let g = createGame(PUZZLES[0], swing);
  const opened = g.line;
  g = placeBet(g, 'UNDER', 5, swing);
  const repriced = g.line;

  assert.ok(repriced > opened,
    'a prestige name landing should lift the line despite a small UNDER bet');
  assert.equal(g.bets[0].line, opened, 'the struck line is preserved on the ticket');

  const result = settle(g, (opened + repriced) / 2);
  assert.equal(result.wins, 0, 'a rating between the two lines misses both');
  assert.equal(result.middled, false);
});

test('doubling down on the same side pays the worse price on the second ticket', () => {
  // Rating sits between the two lines: the first over wins, the chased one does not.
  const result = settle({
    bets: [
      { round: 0, side: 'OVER', chips: 50, line: 6.55, weight: 3.0 },
      { round: 1, side: 'OVER', chips: 50, line: 6.85, weight: 2.2 },
    ],
  }, 6.7);
  assert.equal(result.tickets[0].won, true);
  assert.equal(result.tickets[1].won, false);
});

test('sitting out the whole game is exactly zero, not a loss', () => {
  const result = settle({ bets: [] }, 7.0);
  assert.equal(result.total, 0);
  assert.equal(result.middled, false);
  assert.equal(result.grade.label, 'NO BET');
});

test('winning both legs on the same side is not a middle', () => {
  const result = settle({
    bets: [
      { round: 0, side: 'OVER', chips: 25, line: 6.55, weight: 3.0 },
      { round: 1, side: 'OVER', chips: 25, line: 6.85, weight: 2.2 },
    ],
  }, 9.0);
  assert.equal(result.wins, 2);
  assert.equal(result.middled, false, 'a middle requires having bet both ways');
});

test('the advertised score bounds are actually reachable', () => {
  const { best, worst } = scoreBounds();
  let g = createGame(PUZZLES[0], FIXTURE);
  while (g.status === 'playing' && maxStake(g) > 0) g = placeBet(g, 'OVER', maxStake(g), FIXTURE);
  const win = settle(g, 10.0);
  const lose = settle(g, 1.0);
  assert.equal(win.total, best);
  assert.equal(lose.total, worst);
  assert.equal(best, -worst, 'the game must be symmetric');
});

test('breaking even after real action reads differently from never betting', () => {
  assert.equal(grade(0, true).label, 'BROKE EVEN');
  assert.equal(grade(0, false).label, 'NO BET');
});

/* ---------------- data ---------------- */

test('the curated slate is internally consistent', () => {
  assert.deepEqual(validateData(), []);
});

test('every puzzle produces a line that resolves and is not a giveaway', () => {
  for (const puzzle of PUZZLES) {
    const line = lineFor(revealedBy(revealOrder(hydrateCast(puzzle)), 0));
    assert.notEqual(line, puzzle.rating, `${puzzle.id}: line equals the rating`);
    assert.ok(line > 1 && line < 10, `${puzzle.id}: line ${line} off scale`);
  }
});

test('the slate is not one-sided', () => {
  const overs = PUZZLES.filter(
    (p) => p.rating > lineFor(revealedBy(revealOrder(hydrateCast(p)), 0))).length;
  const share = overs / PUZZLES.length;
  assert.ok(share > 0.3 && share < 0.7,
    `slate is biased: ${overs}/${PUZZLES.length} resolve OVER`);
});

/* ---------------- daily rotation ---------------- */

test('a day always maps to the same puzzle', () => {
  assert.equal(puzzleForDay(500).puzzle.id, puzzleForDay(500).puzzle.id);
  assert.equal(puzzleForDay(0).number, 1);
});

test('every film appears exactly once per pass through the slate', () => {
  const n = PUZZLES.length;
  for (const cycleStart of [0, n, n * 7]) {
    const ids = new Set();
    for (let d = cycleStart; d < cycleStart + n; d++) ids.add(puzzleForDay(d).puzzle.id);
    assert.equal(ids.size, n, `cycle at day ${cycleStart} repeated a film`);
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
    bets: [
      { round: 0, side: 'OVER', chips: 25, line: 6.55, weight: 3.0 },
      { round: 3, side: 'UNDER', chips: 25, line: 6.25, weight: 1.2 },
    ],
  }, 8.0);

  const text = shareText(242, result);
  const squares = [...text.split('\n')[1]];
  assert.equal(squares.length, ROUNDS);
  assert.equal(squares[0], '🟩');
  assert.equal(squares[1], '⬛');
  assert.equal(squares[3], '🟥');
  for (const puzzle of PUZZLES) assert.ok(!text.includes(puzzle.title));
});

/* ---------------- persistence ---------------- */

test('a game saved mid-round comes back intact, and a no-bet day holds the streak', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
  };

  const { saveGame, loadGame, recordResult, loadStats } = await import('../src/storage.js');

  // Regression: the engine's state version was once bumped without updating the
  // check in storage, so every reload silently discarded the game in progress.
  const g = placeBet(createGame(PUZZLES[0], FIXTURE), 'OVER', 25, FIXTURE);
  saveGame(42, g);
  assert.deepEqual(loadGame(42, g.puzzleId), g);
  assert.equal(loadGame(42, 'another-film'), null, 'a different film must not resume');

  // Build a streak, then sit a day out: it should survive.
  recordResult(1, 500, true);
  recordResult(2, 500, true);
  assert.equal(loadStats().streak, 2);

  recordResult(3, 0, false);
  const afterPass = loadStats();
  assert.equal(afterPass.streak, 2, 'declining every price must not break a streak');
  assert.equal(afterPass.passed, 1);
  assert.equal(afterPass.profitable, 2, 'a no-bet day is not a winning day either');

  recordResult(4, 400, true);
  assert.equal(loadStats().streak, 3, 'the streak resumes through the gap');

  recordResult(5, -900, true);
  assert.equal(loadStats().streak, 0, 'an actual losing day still breaks it');

  delete globalThis.localStorage;
});

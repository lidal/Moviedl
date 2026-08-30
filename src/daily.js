import { PUZZLES } from './data/index.js';

/** Day 1 of TYPECAST. Puzzle numbers count forward from here. */
export const EPOCH = { year: 2026, month: 0, day: 1 };

/** Local-midnight rollover, the same as every other daily game. */
export function dayNumber(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(EPOCH.year, EPOCH.month, EPOCH.day);
  return Math.floor((today - epoch) / 86_400_000);
}

/* Deterministic PRNG so every player sees the same slate order. */
function mulberry32(seed) {
  return function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reshuffle the slate on each pass through it, so a player who sticks around
 * past the end of the list does not get the same films in the same order.
 */
function cycleOrder(cycle, length) {
  const rand = mulberry32(cycle * 2654435761 + 12345);
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** The puzzle for a given day, plus its display number. */
export function puzzleForDay(day) {
  const n = PUZZLES.length;
  const wrapped = ((day % n) + n) % n;
  const cycle = Math.floor(day / n);
  const puzzle = PUZZLES[cycleOrder(cycle, n)[wrapped]];
  return { puzzle, number: day + 1, day };
}

/** Today's puzzle. */
export function todaysPuzzle(date = new Date()) {
  return puzzleForDay(dayNumber(date));
}

/** Milliseconds until the next local midnight, for the countdown. */
export function msUntilRollover(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return next.getTime() - date.getTime();
}

/**
 * Test hooks.
 *
 * A daily game normally serves exactly one puzzle every 24 hours, which makes
 * it almost untestable by hand. These query parameters open it up:
 *
 *   ?day=N        play the puzzle for day number N
 *   ?film=<id>    play a specific film (ids are in src/data/puzzles.js)
 *   ?film=random  pick one at random
 *   ?reset        wipe saved progress and stats, then reload clean
 *
 * When any override is active the header shows a TEST badge and the result is
 * kept out of lifetime stats — otherwise a testing session would fabricate a
 * streak and pollute the record.
 */
import { PUZZLES } from './data/index.js';
import { puzzleForDay, dayNumber } from './daily.js';
import { clearGame } from './storage.js';

const params = new URLSearchParams(
  typeof location === 'undefined' ? '' : location.search,
);

/** Clear everything this game has stored. Called before anything else reads it. */
export function maybeReset() {
  if (!params.has('reset')) return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('typecast:')) localStorage.removeItem(key);
    }
  } catch { /* storage unavailable; nothing to clear */ }

  const url = new URL(location.href);
  url.searchParams.delete('reset');
  location.replace(url.toString());
}

/**
 * Resolve which puzzle to play. Returns the normal daily selection unless an
 * override is present.
 */
export function selectPuzzle() {
  const filmParam = params.get('film');
  if (filmParam) {
    const puzzle = filmParam === 'random'
      ? PUZZLES[Math.floor(Math.random() * PUZZLES.length)]
      : PUZZLES.find((p) => p.id === filmParam);

    if (puzzle) {
      // Borrow the real day number so an override still gets a stable save slot.
      const day = dayNumber();
      return { puzzle, number: day + 1, day, override: `film=${puzzle.id}` };
    }
    console.warn(`[typecast] no film with id "${filmParam}" — falling back to today`);
  }

  const dayParam = params.get('day');
  if (dayParam !== null && Number.isFinite(Number(dayParam))) {
    const day = Math.trunc(Number(dayParam));
    return { ...puzzleForDay(day), override: `day=${day}` };
  }

  return { ...puzzleForDay(dayNumber()), override: null };
}

/** Every film in the slate, for the test picker. */
export function slate() {
  return PUZZLES.map((p) => ({ id: p.id, title: p.title, year: p.year }));
}

/**
 * Jump to another film, staying in test mode. Drops the in-progress game so the
 * new film starts clean, but leaves lifetime stats alone — switching films
 * while testing should not wipe a real record.
 */
export function gotoFilm(id) {
  clearGame();
  const url = new URL(location.href);
  url.searchParams.delete('day');
  url.searchParams.set('film', id);
  location.href = url.toString();
}

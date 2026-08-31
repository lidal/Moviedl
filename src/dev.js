/**
 * Test hooks.
 *
 * A daily game serves one puzzle every 24 hours, which makes it almost
 * untestable by hand. Two ways in:
 *
 *   Tap the puzzle number in the header three times to open a film picker.
 *   This is the one that works everywhere, including inside an embedded
 *   viewer, because it needs no URL at all.
 *
 *   Or, when the page is served directly:
 *     ?film=<id>    play a specific film (ids are in src/data/puzzles.js)
 *     ?film=random  pick one at random
 *     ?day=N        play the puzzle for day number N
 *     ?reset        wipe saved progress and stats, then reload clean
 *
 * When any override is active the header shows a TEST badge and the result is
 * kept out of lifetime stats — otherwise a testing session would fabricate a
 * streak and pollute the record.
 */
import { PUZZLES } from './data/index.js';
import { puzzleForDay, dayNumber } from './daily.js';
import { clearGame } from './storage.js';

const KEY_OVERRIDE = 'typecast:override';

/**
 * Find our parameters wherever they survived.
 *
 * An embedded viewer renders the page in a sandboxed frame whose own URL is
 * not the one the reader typed, so `location.search` is empty there however
 * carefully the query string was written. The hash and the referrer sometimes
 * carry it through, so try those too before giving up — and the picker below
 * needs no URL at all, which is why it is the documented route.
 */
function readParams() {
  if (typeof location === 'undefined') return new URLSearchParams('');

  const sources = [location.search, location.hash.replace(/^#/, '?')];
  try {
    if (document.referrer) sources.push(new URL(document.referrer).search);
  } catch { /* opaque or malformed referrer */ }

  for (const source of sources) {
    const params = new URLSearchParams(source.replace(/^[?#]/, ''));
    if (params.has('film') || params.has('day') || params.has('reset')) return params;
  }
  return new URLSearchParams('');
}

const params = readParams();

/* ---------------- a choice that outlives the URL ---------------- */

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(KEY_OVERRIDE) ?? 'null');
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value === null) localStorage.removeItem(KEY_OVERRIDE);
    else localStorage.setItem(KEY_OVERRIDE, JSON.stringify(value));
  } catch { /* storage unavailable; the choice just will not persist */ }
}

/** Switch to a specific film and reload into it. */
export function playFilm(id) {
  writeStored({ film: id });
  clearGame();
  location.reload();
}

/** Go back to whatever today's puzzle actually is. */
export function playToday() {
  writeStored(null);
  clearGame();
  location.reload();
}

/** Wipe progress and lifetime stats, then reload clean. */
export function wipeEverything() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('typecast:')) localStorage.removeItem(key);
    }
  } catch { /* nothing to clear */ }
  location.reload();
}

export function maybeReset() {
  if (!params.has('reset')) return;
  wipeEverything();
}

/* ---------------- puzzle selection ---------------- */

/**
 * Resolve which puzzle to play: an explicit URL parameter first, then a film
 * chosen in the picker, then the actual puzzle for today.
 */
export function selectPuzzle() {
  const stored = readStored();
  const filmParam = params.get('film') ?? stored?.film;

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
    if (stored?.film === filmParam) writeStored(null);
  }

  const dayParam = params.get('day');
  if (dayParam !== null && Number.isFinite(Number(dayParam))) {
    const day = Math.trunc(Number(dayParam));
    return { ...puzzleForDay(day), override: `day=${day}` };
  }

  return { ...puzzleForDay(dayNumber()), override: null };
}

/** Every film in the slate, for the picker. */
export function slate() {
  return PUZZLES.map((p) => ({ id: p.id, title: p.title, year: p.year }));
}

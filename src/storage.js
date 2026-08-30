/**
 * localStorage persistence. Every read is defensive: a player with storage
 * disabled, in a private window, or with a corrupted blob should still get a
 * playable game, just without history.
 */

const KEY_GAME = 'typecast:game';
const KEY_STATS = 'typecast:stats';
const KEY_SEEN_HELP = 'typecast:seen-help';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- in-progress game ---------------- */

/** Current game-state shape. Bump it whenever a saved game would replay wrong. */
const STATE_VERSION = 2;

/**
 * Restore a saved game, but only if it is the same film on the same day and was
 * written by this version of the engine.
 *
 * The film has to be checked as well as the day: a test override can serve a
 * different film for today's day number, and resuming those bets against the
 * wrong film would settle them against the wrong rating. A stale save is
 * discarded rather than migrated — losing one in-progress round beats resuming
 * a game whose actors were dealt in a different order.
 */
export function loadGame(day, puzzleId) {
  const saved = read(KEY_GAME, null);
  if (!saved || saved.day !== day) return null;
  if (saved.state?.version !== STATE_VERSION) return null;
  if (saved.state?.puzzleId !== puzzleId) return null;
  return saved.state;
}

export function saveGame(day, state) {
  write(KEY_GAME, { day, state });
}

/** Drop the in-progress game but keep lifetime stats. */
export function clearGame() {
  try {
    localStorage.removeItem(KEY_GAME);
  } catch { /* nothing to clear */ }
}

/* ---------------- lifetime stats ---------------- */

const EMPTY_STATS = {
  played: 0,
  profitable: 0,
  streak: 0,
  maxStreak: 0,
  best: null,
  worst: null,
  lifetime: 0,
  lastDay: null,
  history: [],
};

export function loadStats() {
  return { ...EMPTY_STATS, ...read(KEY_STATS, {}) };
}

/**
 * Fold a finished day into lifetime stats. Idempotent — replaying or
 * refreshing a completed day must not double-count it.
 *
 * A "streak" here is consecutive *profitable* days, not merely days played:
 * showing up and betting nothing should not build a streak.
 */
export function recordResult(day, total) {
  const stats = loadStats();
  if (stats.lastDay === day) return stats;

  const profitable = total > 0;
  const consecutive = stats.lastDay === day - 1;

  const next = {
    played: stats.played + 1,
    profitable: stats.profitable + (profitable ? 1 : 0),
    streak: profitable ? (consecutive ? stats.streak : 0) + 1 : 0,
    maxStreak: stats.maxStreak,
    best: stats.best === null ? total : Math.max(stats.best, total),
    worst: stats.worst === null ? total : Math.min(stats.worst, total),
    lifetime: stats.lifetime + total,
    lastDay: day,
    history: [...stats.history, { day, total }].slice(-60),
  };
  next.maxStreak = Math.max(stats.maxStreak, next.streak);

  write(KEY_STATS, next);
  return next;
}

/* ---------------- first-run help ---------------- */

export function hasSeenHelp() {
  return read(KEY_SEEN_HELP, false) === true;
}

export function markHelpSeen() {
  write(KEY_SEEN_HELP, true);
}

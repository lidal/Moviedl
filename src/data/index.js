import { ACTORS } from './actors.js';
import { PUZZLES, RATING_SOURCE, DATA_STATUS } from './puzzles.js';

export { ACTORS, PUZZLES, RATING_SOURCE, DATA_STATUS };

/**
 * Merge a puzzle's billed cast with the career profiles in the actor registry.
 * Throws loudly on a missing name — a typo here would silently break the
 * reveal order and the opening line, so it should fail at load, not in play.
 */
export function hydrateCast(puzzle) {
  return puzzle.cast.map((member) => {
    const stats = ACTORS[member.name];
    if (!stats) throw new Error(`No career profile for "${member.name}" (${puzzle.id})`);
    return { ...stats, ...member };
  });
}

/** Sanity-check the whole slate. Used by the tests and the data build script. */
export function validateData() {
  const problems = [];
  const seen = new Set();

  if (!['estimated', 'verified'].includes(DATA_STATUS)) {
    problems.push(`DATA_STATUS must be 'estimated' or 'verified', got '${DATA_STATUS}'`);
  }

  for (const puzzle of PUZZLES) {
    if (seen.has(puzzle.id)) problems.push(`duplicate puzzle id: ${puzzle.id}`);
    seen.add(puzzle.id);

    if (puzzle.cast.length !== 5) {
      problems.push(`${puzzle.id}: expected 5 billed actors, got ${puzzle.cast.length}`);
    }
    if (!(puzzle.rating > 0 && puzzle.rating <= 10)) {
      problems.push(`${puzzle.id}: rating ${puzzle.rating} out of range`);
    }
    if (Math.round(puzzle.rating * 10) !== puzzle.rating * 10) {
      problems.push(`${puzzle.id}: rating must have one decimal place`);
    }

    if (!(puzzle.runtime > 0)) problems.push(`${puzzle.id}: missing runtime`);
    if (!puzzle.certificate) problems.push(`${puzzle.id}: missing certificate`);
    if (!puzzle.genres?.length) problems.push(`${puzzle.id}: missing genres`);

    const names = new Set();
    for (const member of puzzle.cast) {
      if (names.has(member.name)) problems.push(`${puzzle.id}: ${member.name} billed twice`);
      names.add(member.name);
      if (!ACTORS[member.name]) problems.push(`${puzzle.id}: unknown actor "${member.name}"`);
    }
  }

  for (const [name, stats] of Object.entries(ACTORS)) {
    if (!(stats.sd > 0)) problems.push(`${name}: sd must be positive`);
    if (!(stats.min <= stats.avg && stats.avg <= stats.max)) {
      problems.push(`${name}: avg ${stats.avg} outside [${stats.min}, ${stats.max}]`);
    }
    if (stats.photo !== null && typeof stats.photo !== 'string') {
      problems.push(`${name}: photo must be a data URI string or null`);
    }
    if (typeof stats.photo === 'string' && !stats.photo.startsWith('data:image/')) {
      problems.push(`${name}: photo must be an embedded data: URI, not a hotlinked URL`);
    }
  }

  return problems;
}

#!/usr/bin/env node
/**
 * Regenerate src/data/actors.js and src/data/puzzles.js from TMDb.
 *
 *   TMDB_API_KEY=... npm run build:data
 *
 * The slate itself stays hand-curated — see SLATE below. This script only
 * replaces the *numbers*: each film's rating, its top-billed five, and every
 * actor's career mean, spread and range, computed from their real filmography
 * rather than estimated.
 *
 * Flags:
 *   --dry         print what would change, write nothing
 *   --min-votes N ignore films below N votes when profiling a career (default 150)
 *   --no-photos   skip fetching headshots (faster iteration on the numbers)
 *
 * Photos are embedded as base64 `data:` URIs directly in actors.js, not
 * hotlinked. That keeps the shipped app's "zero external requests" property
 * true for images too, and it means a photo never breaks because TMDb moved
 * or deleted a file. The cost is a bigger source file — a small headshot per
 * actor runs 3-8KB as base64, so the whole cast adds a few hundred KB.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'tmdb.json');
const API = 'https://api.themoviedb.org/3';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MIN_VOTES = Number(args[args.indexOf('--min-votes') + 1]) || 150;
const SKIP_PHOTOS = args.includes('--no-photos');

const KEY = process.env.TMDB_API_KEY;
if (!KEY) {
  console.error(`
Missing TMDB_API_KEY.

Get a free key at https://www.themoviedb.org/settings/api, then:

  TMDB_API_KEY=your_key npm run build:data

This overwrites src/data/actors.js and src/data/puzzles.js. Run with --dry first.
`);
  process.exit(1);
}

/**
 * The curated slate: title + year is enough to look up. Keep `note` here —
 * it is editorial, not data, and would otherwise be lost on every rebuild.
 */
const SLATE = [
  { title: '8MM', year: 1999, note: 'The film that started this whole idea.' },
  { title: 'Face/Off', year: 1997, note: 'Two of the most volatile careers in Hollywood, in one film.' },
  { title: 'The Wicker Man', year: 2006, note: 'Not the bees.' },
  { title: 'Adaptation.', year: 2002, note: 'Same wildcard, opposite end of the range.' },
  { title: 'Heat', year: 1995 },
  { title: 'Righteous Kill', year: 2008, note: 'The same two leads. Thirteen years later.' },
  { title: 'Jack and Jill', year: 2011, note: 'An Academy Award winner is in this one.' },
  { title: 'Gigli', year: 2003 },
  { title: 'The Prestige', year: 2006 },
  { title: 'Batman & Robin', year: 1997 },
  { title: 'Michael Clayton', year: 2007 },
  { title: 'The Departed', year: 2006 },
  { title: 'The Happening', year: 2008 },
  { title: 'The Counselor', year: 2013, note: 'Cormac McCarthy wrote it. That is not a guarantee.' },
  { title: 'True Romance', year: 1993 },
  { title: 'The Fifth Element', year: 1997 },
  { title: 'Cats', year: 2019, note: 'Directed by the man who had just won Best Picture.' },
  { title: 'Speed 2: Cruise Control', year: 1997 },
  { title: 'Boogie Nights', year: 1997 },
  { title: 'Con Air', year: 1997 },
  { title: 'Collateral', year: 2004 },
  { title: 'Mamma Mia!', year: 2008 },
];

/* ------------------------------------------------------------------ *
 * TMDb access, with an on-disk cache so re-runs are cheap and polite
 * ------------------------------------------------------------------ */

let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'));
  console.error(`cache: ${Object.keys(cache).length} entries`);
} catch { /* first run */ }

let fetched = 0;

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const cacheKey = url.pathname + '?' + [...url.searchParams]
    .filter(([k]) => k !== 'api_key').map(([k, v]) => `${k}=${v}`).join('&');
  if (cache[cacheKey]) return cache[cacheKey];

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 2) * 1000;
      console.error(`rate limited, waiting ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`TMDb ${res.status} on ${cacheKey}`);
    const json = await res.json();
    cache[cacheKey] = json;
    fetched++;
    await sleep(60);
    return json;
  }
  throw new Error(`giving up on ${cacheKey}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a small headshot and return it as a `data:` URI, or null if the actor
 * has none on file. Cached as base64 text inside the same cache object as the
 * JSON API responses — it is just another string under a distinguishing key.
 */
async function fetchPhoto(profilePath) {
  if (!profilePath || SKIP_PHOTOS) return null;

  const cacheKey = `photo:${profilePath}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];

  const url = `https://image.tmdb.org/t/p/w185${profilePath}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(Number(res.headers.get('retry-after') || 2) * 1000);
      continue;
    }
    if (!res.ok) {
      console.error(`  ! photo ${profilePath}: TMDb ${res.status} — leaving it unset`);
      cache[cacheKey] = null;
      return null;
    }
    const type = res.headers.get('content-type') || 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    const dataUri = `data:${type};base64,${bytes.toString('base64')}`;
    cache[cacheKey] = dataUri;
    fetched++;
    await sleep(60);
    return dataUri;
  }
  console.error(`  ! photo ${profilePath}: giving up after retries`);
  return null;
}

/* ------------------------------------------------------------------ *
 * Career profiling
 * ------------------------------------------------------------------ */

/**
 * Build a career profile from an actor's filmography.
 *
 * Filters matter more than the maths here: unrated and barely-rated films
 * would otherwise dominate the spread and make everyone look like a wildcard.
 * We keep released features with a real vote count, and drop documentaries
 * (an actor appearing as themselves says nothing about their choices).
 */
async function profile(personId, name, profilePath) {
  const { cast = [] } = await tmdb(`/person/${personId}/movie_credits`);

  const ratings = cast
    .filter((film) => film.vote_count >= MIN_VOTES)
    .filter((film) => film.vote_average > 0)
    .filter((film) => !(film.genre_ids || []).includes(99)) // documentary
    .filter((film) => film.release_date)
    .map((film) => film.vote_average);

  if (ratings.length < 5) {
    console.error(`  ! ${name}: only ${ratings.length} qualifying films — profile will be weak`);
  }
  if (ratings.length === 0) throw new Error(`no rated films for ${name}`);

  const n = ratings.length;
  const avg = ratings.reduce((a, b) => a + b, 0) / n;
  // Sample standard deviation; n=1 has no spread to speak of.
  const variance = n > 1
    ? ratings.reduce((a, r) => a + (r - avg) ** 2, 0) / (n - 1)
    : 0.5 ** 2;

  return {
    avg: round1(avg),
    sd: Math.max(0.3, round2(Math.sqrt(variance))),
    min: round1(Math.min(...ratings)),
    max: round1(Math.max(...ratings)),
    credits: n,
    photo: await fetchPhoto(profilePath),
  };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const actors = {};
const puzzles = [];

for (const entry of SLATE) {
  const search = await tmdb('/search/movie', { query: entry.title, year: entry.year });
  const hit = search.results?.[0];
  if (!hit) {
    console.error(`SKIP: no TMDb match for ${entry.title} (${entry.year})`);
    continue;
  }

  const [details, credits] = await Promise.all([
    tmdb(`/movie/${hit.id}`),
    tmdb(`/movie/${hit.id}/credits`),
  ]);

  const director = credits.crew?.find((c) => c.job === 'Director')?.name;

  const billed = credits.cast
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 5);

  console.error(`${entry.title} (${entry.year}) → ${details.vote_average.toFixed(1)}`);

  for (const member of billed) {
    if (!actors[member.name]) {
      actors[member.name] = await profile(member.id, member.name, member.profile_path);
    }
  }

  // US certificate, if TMDb has one on file.
  const releases = await tmdb(`/movie/${hit.id}/release_dates`);
  const certificate = releases.results
    ?.find((r) => r.iso_3166_1 === 'US')
    ?.release_dates?.map((d) => d.certification)
    .find(Boolean);

  puzzles.push({
    id: slug(details.title, details.release_date?.slice(0, 4) ?? entry.year),
    title: details.title,
    year: Number(details.release_date?.slice(0, 4)) || entry.year,
    runtime: details.runtime || undefined,
    certificate: certificate || undefined,
    genres: (details.genres ?? []).map((g) => g.name).slice(0, 3),
    director: director || undefined,
    rating: round1(details.vote_average),
    cast: billed.map((m) => ({ name: m.name })),
    note: entry.note,
    // tagline is left out on purpose: TMDb has `details.tagline`, but a
    // recognisable one gives the film away. Add it here only if you intend to
    // curate them by hand afterwards.
  });
}

function slug(title, year) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${year}`;
}

await mkdir(dirname(CACHE), { recursive: true });
await writeFile(CACHE, JSON.stringify(cache));
console.error(`\n${fetched} requests, ${Object.keys(actors).length} actors, ${puzzles.length} films`);

/* ------------------------------------------------------------------ *
 * Emit
 * ------------------------------------------------------------------ */

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const withPhoto = Object.values(actors).filter((a) => a.photo).length;

const actorsFile = `/**
 * Career profiles, keyed by name.
 *
 *   avg     — mean audience rating across their credited feature films
 *   sd      — standard deviation of those ratings (this drives reveal order)
 *   min/max — worst and best film they appear in
 *   credits — how many features the numbers are drawn from
 *   photo   — a headshot embedded as a \`data:\` URI, or null
 *
 * GENERATED by scripts/build-puzzles.mjs from TMDb on ${new Date().toISOString().slice(0, 10)}
 * (films with at least ${MIN_VOTES} votes, documentaries excluded).
 * ${withPhoto}/${Object.keys(actors).length} actors have a photo${SKIP_PHOTOS ? ' (skipped: --no-photos)' : ''}.
 * Do not edit by hand — re-run \`npm run build:data\`.
 */
export const ACTORS = {
${Object.entries(actors).sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) =>
  `  ${q(name)}: { avg: ${s.avg}, sd: ${s.sd}, min: ${s.min}, max: ${s.max}, credits: ${s.credits}, photo: ${s.photo ? q(s.photo) : 'null'} },`,
).join('\n')}
};
`;

const puzzlesFile = `/**
 * The curated slate.
 *
 * GENERATED by scripts/build-puzzles.mjs — the film list lives in SLATE inside
 * that script. Editorial notes are preserved there; everything else is TMDb.
 */

export const RATING_SOURCE = 'TMDb';

export const PUZZLES = [
${puzzles.map((p) => `  {
    id: ${q(p.id)},
    title: ${q(p.title)},
    year: ${p.year},${p.runtime ? `\n    runtime: ${p.runtime},` : ''}${p.certificate ? `\n    certificate: ${q(p.certificate)},` : ''}${p.genres?.length ? `\n    genres: [${p.genres.map(q).join(', ')}],` : ''}${p.director ? `\n    director: ${q(p.director)},` : ''}
    rating: ${p.rating},
    cast: [
${p.cast.map((c) => `      { name: ${q(c.name)} },`).join('\n')}
    ],${p.note ? `\n    note: ${q(p.note)},` : ''}
  },`).join('\n')}
];
`;

if (DRY) {
  console.error('\n--dry: nothing written. Preview:\n');
  console.log(actorsFile.slice(0, 1200));
  console.log('...\n');
  console.log(puzzlesFile.slice(0, 1200));
} else {
  await writeFile(join(ROOT, 'src/data/actors.js'), actorsFile);
  await writeFile(join(ROOT, 'src/data/puzzles.js'), puzzlesFile);
  console.error(`wrote src/data/actors.js (${withPhoto}/${Object.keys(actors).length} photos) and src/data/puzzles.js`);
  console.error('now run: npm test');
}

# The data

Two files drive everything:

- **`src/data/puzzles.js`** — the curated slate: title, year, director, rating,
  and the five top-billed actors.
- **`src/data/actors.js`** — one career profile per actor, keyed by name and
  shared across every film they appear in.

## ⚠️ The shipped numbers are estimates

The current `actors.js` and the `rating` fields in `puzzles.js` are
**hand-curated approximations**, not fetched from any API. They are internally
consistent and the game plays correctly on them — the slate resolves 11 OVER
and 11 UNDER, and no line lands on a rating — but individual figures will be off
by a decimal here and there, and the career standard deviations are judgement
calls rather than computed.

**Before this goes anywhere public, regenerate them.** The script exists and
does the real computation:

```bash
TMDB_API_KEY=your_key npm run build:data -- --dry   # preview
TMDB_API_KEY=your_key npm run build:data            # write
npm test                                            # re-validate
```

Get a free key at <https://www.themoviedb.org/settings/api>.

The script looks up each film in `SLATE` (inside the script itself — that is
where you add or remove films), pulls the real top-five billing, and for every
actor fetches their full filmography and computes `avg`, `sd`, `min`, `max`
and `credits` from films with at least 150 votes, excluding documentaries.
Responses are cached under `.cache/` so re-runs cost nothing.

Note that it writes `RATING_SOURCE = 'TMDb'`, and the UI label follows that
constant — so the game will correctly say "TMDb rating" rather than "IMDb"
after a rebuild. TMDb ratings run slightly higher and flatter than IMDb's;
expect the slate to need a rebalance check afterwards (`npm test` will fail the
one-sidedness assertion if it drifts too far).

If you want IMDb numbers specifically, TMDb returns an `imdb_id` on every film,
which you can feed to OMDb — but there is no equivalent bulk source for
per-actor career spread, so `sd` would still have to come from TMDb.

## Fields

### A puzzle

```js
{
  id: '8mm-1999',            // stable; used as the storage key
  title: '8MM',
  year: 1999,
  director: 'Joel Schumacher',
  rating: 6.5,               // one decimal, always — the engine relies on it
  cast: [                    // exactly 5, in billing order
    { name: 'Nicolas Cage', role: 'Tom Welles' },
  ],
  note: 'Optional editorial line, shown on the reveal screen.',
}
```

`rating` **must** have exactly one decimal place. Lines sit on a `.x5` grid so
that no bet can ever push, and a two-decimal rating would break that guarantee.
`validateData()` enforces it.

Reveal order is *not* stored. The engine derives it by sorting the cast on `sd`,
so adding a film never means deciding what order its actors appear in.

### An actor

```js
'Nicolas Cage': { avg: 5.9, sd: 1.20, min: 2.4, max: 8.6, credits: 95 }
```

`sd` is the important one. It decides when in the game this actor appears
(highest first, so the wildcard opens and the steadiest actor closes), how the
opening line is weighted, and which volatility tier badge they wear:

| `sd` | Tier | Meaning |
|---|---|---|
| < 0.70 | STEADY | Picks cluster. Trust the average. |
| < 0.90 | MIXED | Mostly reliable, occasional misfire. |
| < 1.10 | SWINGY | Good and bad films, in quantity. |
| ≥ 1.10 | WILDCARD | Tells you almost nothing. |

## Adding a film by hand

1. Add the entry to `PUZZLES` in `src/data/puzzles.js`.
2. Add any new actors to `ACTORS` in `src/data/actors.js`.
3. Add it to `SLATE` in `scripts/build-puzzles.mjs` too, or the next rebuild
   will drop it.
4. `npm test` — validation will catch a missing actor, a duplicate id, a
   wrong-length cast, or a rating that would produce a push.

**What makes a good film for this game:** the cast's reputation and the film's
actual rating should disagree. A stacked ensemble in a disaster (*Cats*,
*Gigli*, *The Counselor*), or a modest cast in something great. Films where the
two agree are dead puzzles — the line lands on the answer and there is no bet
worth making. `npm test` checks the slate as a whole is not one-sided, but it
cannot tell you an individual film is boring.

Note that the slate rotates: `src/daily.js` reshuffles it on each pass, so a
player who sticks around past day 22 does not get the same films in the same
order.

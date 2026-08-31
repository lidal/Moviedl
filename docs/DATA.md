# The data

Two files drive everything:

- **`src/data/puzzles.js`** — the curated slate: title, year, director, rating,
  and the five top-billed actors.
- **`src/data/actors.js`** — one career profile per actor, keyed by name and
  shared across every film they appear in.

## ⚠️ The shipped numbers are estimates

The current `actors.js` and the `rating` fields in `puzzles.js` are
**hand-curated approximations**, not fetched from any API. They are internally
consistent and the game plays correctly on them — films miss their cast baseline
in both directions, and the tolerance schedule is calibrated against these very
numbers — but individual figures will be off by a decimal here and there, and the
career standard deviations are judgement calls rather than computed.

Regenerating will shift the calibration: `sd` drives both the reveal order and
the anchor, so re-check the table in [BETTING.md](BETTING.md) afterwards.

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
  runtime: 123,              // ─┐
  certificate: 'R',          //  ├─ the dossier, shown before the first bet
  genres: ['Crime', 'Drama', 'Mystery'],  // ─┘
  director: 'Joel Schumacher',
  rating: 6.5,               // one decimal, always — the engine relies on it
  cast: [                    // exactly 5, in billing order — just the actor
    { name: 'Nicolas Cage' },
  ],
  note: 'Optional editorial line, shown on the reveal screen.',
  tagline: undefined,        // supported, deliberately unused — see below
}
```

Cast entries carry `name` only. Character names used to be included and are
deliberately not any more: a character name is often the bigger giveaway of the
two (there is no way to say "Tony Stark" without saying the film), and it added
nothing the actor's own name didn't already communicate to the game.

The dossier fields exist so round 1 is an informed gamble. They should place the
film's *register* — its era, length, and who it was sold to — without narrowing
it to one title. Director is deliberately **not** in the dossier; it is held back
for the reveal, because for most of this slate it would be the answer.

`tagline` renders if present, and the build script can populate it from TMDb, but
the shipped data leaves it empty on purpose: a recognisable tagline gives the
film away outright, and there is no game after that. If you turn it on, curate
them one by one rather than taking whatever TMDb returns.

`rating` **must** have exactly one decimal place. Lines sit on a `.x5` grid so
that no bet can ever push, and a two-decimal rating would break that guarantee.
`validateData()` enforces it.

Reveal order is *not* stored. The engine derives it by sorting the cast on `sd`,
so adding a film never means deciding what order its actors appear in.

### An actor

```js
'Nicolas Cage': { avg: 5.9, sd: 1.20, min: 2.4, max: 8.6, credits: 95, photo: null }
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

`photo` is either `null` or a `data:image/...;base64,...` URI — never a
hotlinked URL. `validateData()` rejects anything else. Two reasons for
embedding rather than linking:

- **No external requests.** The app already boasts zero of them for its fonts
  and scripts; a hotlinked headshot would be the odd one out, and would quietly
  stop working the day TMDb reorganises its image paths.
- **It survives being published as an Artifact.** That viewer runs pages inside
  a sandbox that blocks image loads from essentially every external host —
  silently, with nothing in the console to explain a blank box. An inline
  `data:` URI is not a network request at all, so it renders regardless.

The checked-in `actors.js` ships with `photo: null` throughout — this repository
does not assume the machine building it has ordinary internet access, and in
practice the sandboxed session that authored this file did not (every image
host it tried was refused by the egress proxy's organisation policy). Run
`npm run build:data` somewhere with real network access and a TMDb key to
populate real headshots; `--no-photos` skips that half of the fetch if you only
want the numbers refreshed. See the flag list at the top of
`scripts/build-puzzles.mjs` for the fetch mechanics — it pulls each actor's
`profile_path` from the same billed-cast response already used for everything
else, downloads a `w185` thumbnail, and base64-encodes it into the source file.

It also excludes every SLATE film from each actor's own career average — Al
Pacino's baseline for *Heat* is computed from his other ~59 credits, not the
60 that include Heat itself. Small effect for a long career, a real one for a
short one (an actor with ten qualifying films has a tenth of their own average
riding on the film currently being judged, for every puzzle they appear in).

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

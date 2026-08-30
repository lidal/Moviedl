# TYPECAST

A daily guessing game about how good a film's cast says it should be.

You never see the title. You get a short dossier — **year, certificate, runtime
and genres** — and its **five top-billed actors, one per round**. The board posts
a **line**: a rating. Each round you bet over or under, or take no bet — and
you're paid by how far the film beat the line you took, not merely that it did.

The actors arrive **least predictable first**: round 1 is a wildcard whose
filmography runs from masterpiece to direct-to-video and tells you almost
nothing. Each round after that the cast gets steadier, until round 5 hands you
its most typecast member.

Which is exactly why **no bet is a real move**. Round 1 is often unreadable, and
a game that punishes you for saying so rewards guessing over knowing. Passing
costs you only that round's multiplier; a day where you back nothing scores
zero, not a loss, and it will not break a streak.

> The idea came from *8MM*, which opens on Nicolas Cage telling you nothing at
> all, and only later lets Joaquin Phoenix and James Gandolfini explain what
> kind of film you were watching.

## Play

```bash
npm start          # http://localhost:8080
```

Any static file server works — there is no build step and no dependencies. It is
plain ES modules, so it does need to be *served* rather than opened as a
`file://` URL.

## Trying it out

A daily game normally serves one puzzle every 24 hours, which makes it nearly
impossible to test by hand. These query parameters open it up:

| URL | What it does |
|---|---|
| `?film=8mm-1999` | Play a specific film. Ids are in `src/data/puzzles.js` |
| `?film=random` | Pick one at random |
| `?day=4` | Play the puzzle for day number 4 |
| `?reset` | Wipe saved progress and stats, then reload clean |

With any override active the header shows a **TEST** badge, the result is kept
out of your lifetime stats, and the reveal screen grows a picker so you can run
straight through the slate film by film.

Good ones to start with: `?film=8mm-1999` (the film the whole idea came from —
Cage opens and tells you nothing), `?film=gigli-2003` (a stacked cast in a 2.6),
and `?film=heat-1995` (the opposite problem).

## Test

```bash
npm test
```

48 tests over the engine, the data and the daily rotation, using the Node test
runner. No dev dependencies either.

## Single-file build

```bash
npm run bundle
```

Inlines the CSS and all ten modules into `dist/typecast.html` — one
self-contained page, no external requests, droppable on any host. It also emits
`dist/typecast.fragment.html`, the same page as a body fragment for hosts that
supply their own document skeleton.

There is no bundler dependency: the modules share no top-level names, so they
concatenate directly. `scripts/bundle.mjs` verifies that rather than assuming
it, and refuses to build if a name ever collides.

## How the betting works

- **100 chips**, max **25** a round — so four bets spend the lot and you can't
  empty your stack into the easy early rounds. The last round lifts the cap.
- **You're paid by how far you were right**, not merely whether you were. A film
  landing 1.25 above your line pays five times one landing 0.25 above it.
  Direction alone is easy once you recognise the film; margin is what separates
  "this one is good" from "this one is 8.3".
- **Riding a position escalates.** Backing a side pushes the line 0.60 away from
  it, so the next bet takes a worse number — but pays far more if it lands:
  ×1.00 → ×1.94 → ×3.05 → ×4.35. The multiplier climbs as the margin shrinks, so
  **how far you can ride it is your guess at the number.**
- **No bet is a real move.** Passing costs only that round's multiplier, scores
  zero rather than a loss, and holds your streak.
- **Or change your mind** — turning around gets a better number, and tickets
  settle at the line they were struck at, so both sides can pay.

The full design — why fixed odds was solved, why a rising multiplier only works
when it's earned, and the calibration against the real slate — is in
**[docs/BETTING.md](docs/BETTING.md)**.

## ⚠️ The ratings are estimates right now

`src/data/actors.js` and the `rating` fields in `src/data/puzzles.js` are
hand-curated approximations. The game plays correctly on them, but the numbers
are not authoritative. **Regenerate them from TMDb before publishing:**

```bash
TMDB_API_KEY=your_key npm run build:data -- --dry   # preview
TMDB_API_KEY=your_key npm run build:data
npm test
```

See **[docs/DATA.md](docs/DATA.md)** for the schema, what makes a good film for
the slate, and how to add one.

## Layout

```
index.html            markup
styles.css            dark theme; three accent colours do all the signalling
src/
  engine.js           betting maths. pure, DOM-free, fully tested
  daily.js            date → puzzle, with a reshuffle on each pass
  storage.js          localStorage: progress, streaks, lifetime stats
  share.js            Wordle-style share card
  ui.js               rendering
  main.js             controller
  data/
    puzzles.js        the curated slate
    actors.js         career profiles, shared across films
scripts/
  build-puzzles.mjs   regenerate the data from TMDb
test/
  engine.test.mjs
```

`engine.js` decides everything and touches no DOM; `ui.js` touches the DOM and
decides nothing. Adding a film means editing data, never code.

## Deploying

It's a static site — any host will do. For GitHub Pages, push and point Pages at
the branch root.

## Still to do

- Regenerate the data (above). This is the only thing blocking a public launch.
- The slate is 22 films — about three weeks before it repeats. Worth extending.
- No poster or headshot art, deliberately: it would need an image API and a
  licence, and a photo of the actor gives away the era, which is information the
  game hasn't decided to sell yet.

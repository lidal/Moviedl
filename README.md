# TYPECAST

A daily guessing game about how good a film's cast says it should be.

You never see the title. You get a short dossier — **year, certificate, runtime
and genres** — and its **five top-billed actors, one per round**. Each round you
drag a dial to the rating you think it scored and put chips behind it, or sit
out. Then the film is revealed and every call settles on how close it was.

The dossier is there so the opening call, which carries the heaviest multiplier
in the game, is an informed gamble rather than a blind one. It places the film's
register without naming it.

The catch is the order the actors arrive in. They come **least predictable
first**: round 1 is a wildcard whose filmography runs from masterpiece to
direct-to-video and tells you almost nothing. Each round after that the cast
gets steadier, until round 5 hands you its most typecast member, whose films
cluster tightly enough to actually be worth something.

So the evidence improves exactly as the payout decays — a chip staked in round 1
swings the scoreboard ×3.0 and a chip staked in round 5 swings ×1.0, in **both**
directions. You are paid most for betting when you know least.

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

40 tests over the engine, the data and the daily rotation, using the Node test
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

Short version:

- **100 chips** for the whole film, **max 50** in any one round, so you can never
  spend the stack in one move.
- The dial opens on what the cast you've **seen so far** averages out to. It's an
  anchor, not a hint — most films miss it, and the game is guessing which way.
- **A green band shows what profits.** Dead centre wins your full stake, the edge
  breaks even, twice the band loses the lot. You never do arithmetic; you watch
  the band.
- **The band tightens every round** — ±2.00 down to ±1.00 — because by round 5
  you've seen the whole cast. Without that, waiting would be free money.
- Round weights **×3.0 → ×1.0**, applied to losses as well as wins. Between the
  two, the same accuracy is always worth more the earlier you commit to it.
- The dial stays where you left it, so **doubling down** takes no effort. Or put
  calls either side of the truth and, if both land, **both pay** — a *bracket*.

The full design — the calibration against the real slate, what the slider gained
and lost versus the over/under version it replaced, and which knobs to turn after
playtesting — is in **[docs/BETTING.md](docs/BETTING.md)**.

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

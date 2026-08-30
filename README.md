# TYPECAST

A daily guessing game about how good a film's cast says it should be.

You never see the title. You get its **five top-billed actors, one per round**,
and a posted **line** — a rating. Each round you bet over or under, or sit out.
Then the film is revealed and your tickets settle.

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

Any static file server works — there is no build step, no bundler and no
dependencies. It is plain ES modules, so it does need to be *served* rather than
opened as a `file://` URL.

## Test

```bash
npm test
```

36 tests over the engine, the data and the daily rotation, using the Node test
runner. No dev dependencies either.

## How the betting works

Short version:

- **100 chips** for the whole film, **max 50** in any one round, so you can never
  spend the stack in one move.
- Round weights **×3.0, ×2.2, ×1.6, ×1.2, ×1.0** — applied to losses as well as
  wins, so the blind opening bet is a real commitment.
- **The line moves against your money.** Back over and it climbs. So doubling
  down later means paying a worse number for the same opinion, while turning
  around gets you a better one.
- **Tickets settle against the line they were struck at.** Bet over at 6.55,
  reverse to under at 6.85, and a true rating of 6.7 pays you *twice*. That's a
  middle, and it's the best thing that can happen to you.
- Lines sit on a `.x5` grid, so nothing ever pushes.

The full design — including the opening line's inverse-variance weighting, the
two alternatives I rejected, and which knobs to turn after playtesting — is in
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

# The betting design

Over/under on a moving line. A bet wins or loses its stake; the multiplier
escalates as your own money drags the line against you, so the harder bet is the
bigger prize.

## The shape

**Setup.** One film, five rounds, one more top-billed actor each round. You hold
**100 chips** and may stake at most **25** a round — so four bets spend the lot.
The final round lifts the cap.

**The line.** A rating, priced as an inverse-variance weighted mean of the career
averages of the actors revealed **so far** — never the whole billing, which would
leak actors you have not met. It reprices as each new name lands.

**Each round** you back over or under at the posted line, or take no bet.

## A bet wins or loses its stake — the multiplier is the reward

```
multiplier = 1 + 1.2 × (rating points your own money has moved the line)
payout     = ± chips × multiplier × 10
```

That is the entire scoring dial, and it says one thing: **you are paid for the
difficulty you took on.** Backing a side pushes the line 0.60 away from it, so
each further bet on the same read is a harder call at a bigger prize:

```
R1  OVER 25 @ 6.85   ×1.00   +250
R2  OVER 25 @ 7.35   ×1.72   +430
R3  OVER 25 @ 7.65   ×2.44   +610
R4  OVER 25 @ 8.15   ×3.16   +790
R5  no bet  @ 8.75           past 8.3 — leave it alone
```

"Is it over 6.85?" is easy once you recognise the film. "Is it over 8.15?" is a
real question, and it pays three times as much. **How far you can ride it is
your guess at the number** — and one round too far hands back more than the last
two rounds made.

### Why fixed odds works here, having failed before

The original version paid a flat stake on direction and was a solved game:
backing the correct side scored exactly the ceiling on all 22 films, zero
variance. That was not fixed odds' fault — it was the *static* line. Priced off
the cast, it never left the 5.9–6.9 band, so "is this better than 6.4?" was
trivial for any film you recognise.

Once your own betting moves the line, the difficulty of the direction question
is something you choose. Fixed odds becomes the right instrument again, and it
is far more legible than paying by margin: each bet is a clean yes/no at a
visibly bigger stake, rather than arithmetic on a shrinking edge.

Paying by margin was tried in between and had the opposite problem — the margin
collapsed faster than the multiplier grew, so the bravest bet on the ladder paid
the *least* (+163 against +496 the round before). Exactly backwards.

### Not keyed to the round number

The multiplier ignores which round you are in. A player who sits out four rounds
meets the opening line with the whole cast revealed — the easiest bet in the
game — and paying them more for having reached round 5 would reward exactly the
passivity this is meant to discourage. Sit out four rounds and the fifth is
still ×1.00.

Measured across the slate:

| Player | Average |
|---|---|
| Knows the number (bets while confident within 0.15) | 1814 |
| Knows it roughly (within 0.6) | 1005 |
| Knows only good/bad | 638 |
| Passes everything, then backs the final round | 500 |
| Recognises nothing | 0 |

Ceiling is **±2,080**.

## No bet is a real move

Round 1 is a dossier and one wildcard actor. A no-bet day scores zero rather
than a loss, and holds a streak instead of breaking it. The final round lifts
the cap from 25 to **50** — passing is a real fallback, worth about 500, but not
a plan: an unmoved line is the easiest bet in the game and pays ×1.00.

## Changing your mind

Backing a side pushes the line away from it, so turning around gets you a better
number than you started with. Tickets settle at the line they were struck at, so
over at 6.55 and under at 6.85 can both pay if the film lands between — a
**middle**. Casting news can also move the line through an open position, so a
hedge is not guaranteed; every ticket shows the number it was struck at.

**No pushes.** Lines sit on a `.x5` grid and ratings have one decimal.

Score range is **−3,229 to +3,229**, symmetric by construction — including the
rounding, which uses half-away-from-zero so a win and the identical loss are
exact mirrors.

## Knobs

All at the top of `src/engine.js`; the tests assert invariants rather than
specific numbers.

| Constant | Now | Effect of raising it |
|---|---|---|
| `TRAVEL_BONUS` | 1.2 | Steeper escalation for riding a position |
| `PRESSURE_PER_CHIP` | 0.024 | The book reacts harder, so the ladder climbs faster |
| `MAX_CHIPS_PER_ROUND` | 25 | Higher lets a player front-load again |
| `FINAL_ROUND_CAP` | 50 | Higher makes simply waiting more attractive |

## Alternatives tried and rejected

**Fixed odds on a static line.** Solved: the line never left 5.9–6.9, so
direction was trivial. In git at `165e330`.

**Paying by margin.** Fixed the solved-game problem but inverted the reward — the
bravest bet on the ladder paid the least. In git at `21e0afb`.

**A free slider scored on distance.** Asks the right question but loses the
moving line, and the hedge gets strictly worse. In git at `c2d9024`.

**Multipliers keyed to the round number.** Rewards waiting, which is the one
behaviour the design is trying to discourage.

**A harder-moving line under fixed odds.** No effect whatsoever — spread across
films stayed at exactly zero.

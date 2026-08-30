# The betting design

Over/under on a moving line, paid by margin, with the multiplier escalating as
your own money drags the line against you.

## The shape

**Setup.** One film, five rounds, one more top-billed actor each round. You hold
**100 chips** and may stake at most **25** a round — so four bets spend the lot.
The final round lifts the cap.

**The line.** A rating, priced as an inverse-variance weighted mean of the career
averages of the actors revealed **so far** — never the whole billing, which would
leak actors you have not met. It reprices as each new name lands.

**Each round** you back over or under at the posted line, or take no bet.

## Paid by margin, not by direction

```
points  = clamp((rating − line) × direction, ±1.25)
payout  = chips × multiplier × points × 10
```

A film landing 1.25 above your line pays five times one landing 0.25 above it.

This is the load-bearing change, and it exists because **direction alone is a
solved question**. The line only ever sits between about 5.9 and 6.9, so "is
this better than 6.4?" is trivially answerable for any film you recognise. Under
fixed odds, backing the correct side every round scored exactly the ceiling on
all 22 films, with zero variance — not a good strategy but *the* strategy, with
no decisions in it. Paying by margin is what separates "this one is good" from
"this one is 8.3".

No line-movement rule can fix fixed odds, incidentally: a player who knows the
rating simply takes the correct side of whatever line is posted, and moving it
further just hands them a better price on the other side.

## The escalation

| Round | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Base multiplier | ×1.0 | ×1.125 | ×1.25 | ×1.375 | ×1.5 |

Plus **×1.2 per rating point your own money has moved the line**. A full 25-chip
bet moves it 0.60, so riding a position compounds fast:

```
R1  OVER 25 @ 6.85   ×1.00   +313
R2  OVER 25 @ 7.35   ×1.94   +460
R3  OVER 25 @ 7.65   ×3.05   +496
R4  OVER 25 @ 8.15   ×4.35   +163
R5  no bet  @ 8.75           the line has passed 8.3
```

**The multiplier climbs exactly as the margin shrinks**, so the two nearly
cancel — and where they stop cancelling is where you think the film rates. How
far you can ride it *is* your estimate of the number. Someone who only knows
"it's great" gets off after two rounds and banks 773 instead of 1,432.

The rise must be **earned**, not merely late. A rising curve on its own is a
disaster: a player who waits keeps their whole stack, has never pushed the line
against themselves, and would collect the biggest multiplier too. Measured,
waiting outscored playing by 80%. The travel bonus only pays someone who
actually moved the line, which is what balances the two.

## Calibration

Measured across the slate, average credits per day:

| Player | Score |
|---|---|
| Knows the number, rides until the price dies | 1942 |
| Waits for the last round, then all in | 1930 |
| Bets the cap as early as possible | 1959 |
| Knows only good/bad | 1085 |
| Recognises nothing, passes | 0 |

Two properties to preserve if you retune:

- **The first three are within 2%** — no dominant strategy. Dumping early,
  riding it out and waiting are all viable.
- **Knowing the number beats knowing good/bad by ~860.** Under fixed odds that
  gap was 24.

The `POINT_CLAMP` exists because riding correctly earns *less* each round (the
line closes on the truth) while riding wrong loses *more* (it runs away), so the
downside compounds harder than the upside. At ±1.25 a wrong-way rider loses
about twice what a right-way rider makes; uncapped it was two and a half times.
The UI states the escalation live — *"your money has moved this line 1.80 — this
bet pays ×4.35, but the line is 1.80 harder to beat"* — so the ramp is visible
rather than a trap, with the no-bet button as the brake.

## No bet is a real move

Round 1 is a dossier and one wildcard actor. Passing costs only that round's
multiplier, a no-bet day scores zero rather than a loss, and it holds a streak
instead of breaking it. The final round lifts the stake cap so a player who
preserved their stack can still deploy all 100 chips.

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
| `BASE_WEIGHTS` | 1.0 → 1.5 | Rewards waiting; needs more travel bonus to balance |
| `TRAVEL_BONUS` | 1.2 | Steeper escalation for riding a position |
| `POINT_CLAMP` | 1.25 | Bigger swings; being wrong hurts disproportionately more |
| `PRESSURE_PER_CHIP` | 0.024 | The book reacts harder to your money |
| `MAX_CHIPS_PER_ROUND` | 25 | Higher lets a player front-load again |

## Alternatives tried and rejected

**Fixed odds (win or lose the stake).** Solved, as above. Tagged `fixed-odds-v1`.

**A free slider scored on distance.** Asks the right question but loses the
moving line, and the hedge gets strictly worse. In git at `c2d9024`.

**Rising multipliers by round number alone.** Waiting dominates by 80%.

**A harder-moving line under fixed odds.** No effect whatsoever — spread across
films stayed at exactly zero.

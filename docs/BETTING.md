# The scoring design

You asked for a free slider instead of over/under, and for a point system that
makes sense once the bet is a number rather than a side. This is what it became,
plus the alternatives that did not survive.

## The shape

**Setup.** One film. Five rounds, each revealing one more top-billed actor. You
hold **100 chips** and may stake at most **50** in a round, so a second decision
always exists.

**Each round** you drag a dial to a rating and put chips behind it, or sit out.

**The anchor.** The dial opens on the inverse-variance weighted mean of the
career averages of the actors revealed *so far* — leaning on the steady actors
and largely ignoring the wildcard, which is both the statistically correct way
to pool noisy estimates and what a person actually does.

It only ever sees the revealed cast. An anchor computed over the whole billing
would quietly leak the actors you have not met yet. There is a test for this.

**Scoring.** Each call is graded on distance alone:

```
error = |call − rating|
score = clamp(1 − error / tolerance, −1, +1)
payout = chips × weight × 10 × score
```

| Distance from the truth | Score | Meaning |
|---|---|---|
| 0 | +1 | full stake won |
| half the tolerance | +0.5 | |
| the tolerance | 0 | break even |
| twice the tolerance | −1 | full stake lost |
| beyond that | −1 | capped |

Linear, not curved, because a player has to look at the band on the dial and
know what a miss costs without doing arithmetic. The cap matters too: a wild
miss cannot cost more than a merely bad one, so a brave call that lands nowhere
is survivable.

## The two decaying dials

| Round | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Weight | ×3.0 | ×2.2 | ×1.6 | ×1.2 | ×1.0 |
| Tolerance | ±2.00 | ±1.75 | ±1.50 | ±1.25 | ±1.00 |

The weight is the conviction dial, applied to losses as well as wins so an early
call is a real commitment.

The **tolerance is the load-bearing addition**, and it exists because of a
problem the over/under version did not have. Later rounds are strictly better
informed — by round 5 you have seen the whole cast and may well have recognised
the film. Without a rising bar, a late call is near-free money and the correct
play is simply to wait. Demanding more precision exactly as the evidence
improves is what keeps an early call worth making.

Between the two, **the same accuracy is always worth more the earlier you commit
to it** — there is a test asserting exactly that, across the whole error range.

## Calibration

The schedule is measured against the real slate, not guessed. Expected credits
on a 50-chip stake:

| Player | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Accepts the anchor unchanged | +205 | +34 | −56 | −100 | −141 |
| Lands within 1.5 | +375 | +157 | 0 | −120 | −250 |
| Lands within 0.8 | +900 | +597 | +373 | +216 | +100 |
| Lands within 0.3 | +1275 | +911 | +640 | +456 | +350 |

Two properties worth preserving if you retune:

- **Accepting the anchor is roughly break-even in round 1 and clearly losing by
  round 5.** Mashing the default is not a strategy, and waiting on it is worse.
- **Every row falls left to right.** At any skill level, earlier is better.

The naive anchor sits about **1.5–1.7** from the truth on average, because films
genuinely deviate from what their cast implies — that is the game. Tolerances
much below that make the game unwinnable for anyone who has not recognised the
film outright; much above and it stops asking anything.

## Backing yourself, and changing your mind

The dial stays where you left it, so **doubling down** — calling the same number
again — is the zero-effort action and moving off it is deliberate.

And you can do both. Place calls either side of where you think the truth sits
and, if both land inside their bands, **both pay**. That is a **bracket**, the
slider's version of middling a line, and it is the best outcome in the game.
Unlike the over/under version, a bracket is not guaranteed to be winnable: the
bands have to actually reach, so hedging costs precision rather than price.

Score range is **−2,600 to +2,600**, symmetric by construction.

## What this replaced, and what was lost

The previous version posted a line and took over/under bets, with the line
moving against your money so that doubling down cost a worse number and
reversing got a better one. Tickets settled against the line they were struck
at, which made a reversal a genuine middle.

That mechanic was the cleverest thing in the game, and the slider does not have
an equivalent — there is no posted price for the book to move. What replaces it:

- The **shrinking tolerance** does the job the moving line did, discouraging you
  from waiting for certainty.
- The **bracket** does the job the middle did, but honestly: with a line, a
  reversal *always* opened a winnable gap. With a dial, you have to place both
  calls well enough that the bands actually reach the truth. It is a harder,
  better hedge.

The gain is that the game now asks the question it always claimed to ask. Over
and under is a coin flip you can win by accident; a number is a real opinion,
and the scoreboard can tell the difference between 6.4 and 2.6.

## Alternatives I rejected

**Slider with no stake.** Score the distance each round, weight the early
rounds. Loses the bet entirely — there is no conviction to express, and no
reason ever to sit out.

**Slider plus a band width you choose.** Instead of chips, you pick how precise
to be: narrow band pays more, wide band is safe. Genuinely elegant, and it folds
stake and confidence into one control. Rejected because it is two continuous
dials per round on a phone, and because the chip budget — the thing that makes
rounds trade off against each other — disappears.

**Keeping over/under alongside the slider.** Two ways to bet, neither
interesting. The scoring would also stop being comparable across players.

## Knobs

All at the top of `src/engine.js`. The tests assert the invariants (symmetry,
monotone tolerance, early-beats-late) rather than the specific numbers, so these
can be retuned freely:

| Constant | Now | Effect of raising it |
|---|---|---|
| `ROUND_WEIGHTS` | 3.0 → 1.0 | Steeper decay punishes waiting harder |
| `TOLERANCES` | 2.0 → 1.0 | Higher is more forgiving throughout |
| `MAX_CHIPS_PER_ROUND` | 50 | Higher lets a player commit in fewer rounds |
| `TOTAL_CHIPS` | 100 | Scales the whole scoreboard |

The one most worth playtesting is the **tolerance floor**. At ±1.00 in round 5,
a player who has recognised the film is well rewarded and one who has not is
punished. If that proves too harsh for casual players, lifting the floor to
±1.25 softens the endgame without touching the early-beats-late gradient.

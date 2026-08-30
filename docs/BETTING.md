# The betting design

Over/under on a moving line, with declining a bet as a first-class move.

## The shape

**Setup.** One film. Five rounds, each revealing one more top-billed actor. You
hold **100 chips** and may stake at most **50** in a round — except the last,
where you may back everything you have left.

**The line.** A rating, priced as an inverse-variance weighted mean of the career
averages of the actors revealed **so far**. Precision weighting leans on the
steady actors and largely ignores the wildcard, which is both the right way to
pool noisy estimates and what a person actually does.

It only ever sees the revealed cast. A line priced off the whole billing would
quietly leak the actors you have not met yet. There is a test for this.

**Each round** you stake chips on OVER or UNDER at the posted line, or take no
bet. At the reveal, each ticket settles against **the line it was struck at**.

## No bet is a real move

Round 1 shows a dossier and one wildcard actor. Frequently there is nothing to
read, and a game that punishes you for saying so is rewarding guessing rather
than knowing. So:

- **Passing costs only that round's multiplier.** Your chips keep full value.
- **A day where you back nothing scores zero**, not a loss.
- **It does not break a streak.** A streak is consecutive profitable days; a
  no-bet day holds it rather than resetting it. It does not extend one either —
  sitting out should not build a record.
- **The final round lifts the stake cap**, so someone who preserved their stack
  all game can still deploy all 100 chips on the read they finally have.

This is the fix for a real flaw. When the reveal order was low-variance-first,
round 1 was the *most* informative round and deserved the biggest multiplier.
Once the wildcard led, the weight curve stopped matching the information curve:
the least knowable round carried the biggest multiplier. Passing had to become
genuinely cheap, and the curve had to flatten.

## The two decaying dials

| Round | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Weight | ×2.0 | ×1.7 | ×1.4 | ×1.2 | ×1.0 |

Applied to losses as well as wins. If it only multiplied wins, everyone would
max round 1 and the game would have no shape.

The curve is deliberately **gentle**. At ×3.0 → ×1.0 (an earlier version),
skipping round 1 cost most of your upside and the game effectively required a
blind gamble. At ×2.0 → ×1.0 an early read is worth double a late one — real,
but survivable. Combined with the uncapped final round, a player who passes all
game can still reach **±1,000** against a ceiling of **±1,850**, rather than the
±500 against ±2,600 the steep curve allowed.

## The line moves, for two reasons

Kept deliberately separate, and labelled differently in the UI:

1. **Casting news.** Each new name reprices the market. A prestige actor lifts
   the line; a direct-to-video regular drops it. This is information you can
   already see on screen, so it leaks nothing.
2. **Your money.** Backing a side pushes the line away from it — a 50-chip bet
   moves it three ticks, a 25-chip bet two, anything smaller one. So doubling
   down costs a worse number for the same opinion, while turning around gets a
   better one.

Because tickets settle at their struck line, an early bet plus a later reversal
can leave you **middled**: bet OVER at 6.55, reverse to UNDER at 6.85, and a
true rating of 6.7 pays *twice*.

**One caveat, and it is a real trade-off.** In an earlier version the line moved
*only* on your bets, which made a reversal mathematically guaranteed to open a
winnable gap. Now that the line also reprices on casting, a big name landing
between your two bets can carry it past both of them and lose both legs. That is
the price of a line that reflects the cast you can see — and it is visible rather
than hidden, since every ticket displays the number it was struck at. There is a
test documenting exactly this whipsaw.

**No pushes.** Lines sit on a `.x5` grid and ratings have one decimal, so every
ticket resolves.

Score range is **−1,850 to +1,850**, symmetric by construction.

## Knobs

All at the top of `src/engine.js`. The tests assert invariants (symmetry,
monotone weights, the line never seeing hidden actors) rather than specific
numbers, so these retune freely:

| Constant | Now | Effect of raising it |
|---|---|---|
| `ROUND_WEIGHTS` | 2.0 → 1.0 | Steeper decay punishes passing harder |
| `MAX_CHIPS_PER_ROUND` | 50 | Higher lets a player commit in fewer rounds |
| `TOTAL_CHIPS` | 100 | Scales the whole scoreboard |
| `LINE_TICK` | 0.10 | Wider middles, cheaper hedges |
| `lineShift()` | 1–3 ticks | How hard the book reacts to your money |

The one most worth playtesting is **`ROUND_WEIGHTS`**. It is the whole tension
between "commit early" and "do not punish me for not knowing", and the right
answer depends on how often players actually recognise a film from four actors.
If passing still feels forced, flatten further (1.5 → 1.0). If nobody ever bets
early, steepen toward 2.5.

## Alternatives tried and rejected

**A free slider instead of over/under.** You drag to a rating and are scored on
distance, with the profit band tightening each round. Built and playtested. It
asks a better question — a number is a real opinion where over/under is a coin
flip you can win by accident — but it lost the moving line entirely, and the
hedge became strictly worse: with a line, a reversal always opened a gap; with a
dial, both bands had to reach. The full write-up is in the git history at
`c2d9024` if you want it back.

**Weight only on wins.** Everyone maxes round 1. Dead on arrival.

**A fixed line that never moves.** No reason to ever hedge — a reversal at the
same number just hands back part of your first bet.

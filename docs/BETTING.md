# The betting design

You asked for a betting mechanic where you can double down when you think your
first read was right, and bet the other way when you think you were wrong, with
early bets weighted higher. This is what I built and why, plus the two
alternatives I tried first and rejected.

## What shipped: a moving line with decaying weights

**Setup.** One film. Five rounds. Each round reveals one more top-billed actor.
You hold **100 chips** for the whole film and may stake at most **50** in any one
round — so you can never spend the stack in a single move, and at least one more
decision always exists.

**The line.** The board posts a rating. It is not arbitrary: it is the
inverse-variance weighted mean of the five actors' career averages. The market
leans on the actors whose presence actually predicts something and mostly
ignores the wildcard. So the question the game asks is not "is this film good?"
but **"does this film beat or miss the baseline its cast implies?"** — which is
a much better question, because the answer isn't obvious even when you recognise
the film.

**The bet.** Each round: stake chips on OVER or UNDER, or sit out.

**Weights.** A chip staked in round 1 swings the scoreboard ×3.0. By round 5 it
swings ×1.0.

| Round | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Weight | ×3.0 | ×2.2 | ×1.6 | ×1.2 | ×1.0 |

The weight applies to **wins and losses alike**. This is the load-bearing
decision. If it only multiplied wins, every player would max round 1 and the
game would have no shape. Applied symmetrically, the blind opening bet is a
genuine commitment: being confident and wrong is the single most expensive thing
you can do.

**The line moves against you.** Back OVER and the line climbs; back UNDER and it
drops. A 50-chip bet moves it three ticks (0.30), a 25-chip bet two, anything
smaller one.

**Tickets settle against the line they were struck at**, not the closing line.
This is what makes the whole thing work:

- **Doubling down** costs you a worse number for the same opinion. Bet OVER at
  6.55 and the line goes to 6.85; your second OVER now needs a better result to
  cash.
- **Turning around** gets you a better number. Bet OVER at 6.55, then UNDER at
  6.85, and if the true rating is 6.7 **both tickets win**. That is a *middle*,
  and it is the best outcome in the game.

Because backing a side always pushes the line away from that side, a reversal is
always struck on the far side of your original ticket. There is no sequence of
legal bets that opens a window where both legs lose — a hedge is always a real
hedge. (`test/engine.test.mjs` proves this exhaustively over every legal
stake pairing.)

**Why the wildcard comes first.** Actors arrive *descending* by career
volatility, so the least predictable member of the cast opens and the most
typecast one closes. The evidence improves exactly as the payout decays: the
round-1 bet is close to blind and pays ×3.0, and by the time the picture is
clear you are working with ×1.2 and ×1.0 chips.

That is what gives the double-down and the reversal something to do. You commit
early on thin evidence, and every round after it is a running verdict on whether
you were right — with the line moving against you the whole time. The 8MM case
is the design brief in miniature: Nicolas Cage opens and tells you nothing at
all, and only later do Joaquin Phoenix and James Gandolfini explain what kind of
film you were watching.

**No pushes.** Lines always land on a `.x5` grid and ratings have one decimal, so
every ticket resolves. The 0.10 tick also means every gap opened by a reversal
contains exactly one reachable rating per tick.

Score range is **−2,600 to +2,600**, symmetric by construction.

## Worked example

Today's line opens at **6.45**.

| Round | Action | Line struck | Result if the film is 7.9 |
|---|---|---|---|
| 1 | OVER, 50 chips, ×3.0 | 6.45 | **+1,500** |
| 2 | sit out | — | — |
| 3 | UNDER, 25 chips, ×1.6 | 6.75 | −400 |
| 4 | OVER, 25 chips, ×1.2 | 6.55 | +300 |
| 5 | sit out | — | — |
| | | **Net** | **+1,400** |

The round-3 hedge cost 400. Had the film landed at 6.7 instead, rounds 1 and 3
would *both* have paid — the middle.

## Alternatives I rejected

**A fixed line with no movement.** Simplest possible version: one line all game,
bet over/under each round, early rounds weighted more. It works, but there is no
reason to ever hedge — a reversal at the same number is just handing back part
of your first bet, and the "bet opposite if you think you were wrong" half of
your brief becomes strictly dominated by "bet smaller". The moving line is what
turns a reversal into a position worth taking.

**Point estimate plus confidence.** Each round, slide a guess for the rating and
pick a confidence; score by `stake × f(|guess − actual|)`. More precise, and it
felt like a maths exam rather than a bet. It also kills the double-down/reverse
mechanic entirely — there is no *side* to be on, so there is nothing to reverse.

**Parimutuel chip allocation.** Spread 100 chips across ten over/under buckets,
net position settles. Elegant on paper, unreadable on a phone, and the "one
decision per round" rhythm that makes daily games work disappears.

## Knobs

All of these live at the top of `src/engine.js`, and the test suite covers the
invariants rather than the specific numbers, so they can be retuned freely:

| Constant | Now | Effect of raising it |
|---|---|---|
| `ROUND_WEIGHTS` | 3.0 → 1.0 | Steeper decay punishes waiting harder |
| `MAX_CHIPS_PER_ROUND` | 50 | Higher lets a player commit in fewer rounds |
| `TOTAL_CHIPS` | 100 | Scales the whole scoreboard |
| `LINE_TICK` | 0.10 | Wider middles, cheaper hedges |
| `lineShift()` | 1–3 ticks | How hard the book reacts to your money |

Two that are worth playtesting before you settle:

- **`MAX_CHIPS_PER_ROUND`.** At 50, a confident player spends everything by
  round 2 and coasts. At 40 they must use three rounds, which forces at least
  one decision after the evidence has started to muddy.
- **The weight curve.** ×3.0 → ×1.0 currently makes round 1 worth as much as
  rounds 4 and 5 combined — and with the wildcard opening, that round is close
  to a coin flip. If playtesting shows the game swings too hard on a guess made
  before anyone knows anything, flatten the front (×2.2 → ×1.0) so the opening
  bet costs less to get wrong.

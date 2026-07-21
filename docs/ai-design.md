# AI and Balance Design

## Purpose

The first AI is both an opponent and a design instrument. It must use the same
public rules as a player, remain deterministic under a fixed seed, and run
without React, Three.js, or browser globals.

## Required model API

The rules engine exposes serializable state and pure operations conceptually
equivalent to:

```ts
legalActions(state): Action[]
applyAction(state, action): GameState
evaluate(state, team): number
```

Normal actions and complete simultaneous retreat plans are enumerable. Search
operates on cloned states and never mutates the live match.

## Initial opponent

The Standard opponent performs a two-ply adversarial search:

1. Enumerate its legal actions and resulting retreat plans.
2. Simulate each result.
3. Enumerate the opponent's strongest response.
4. Score the resulting position from the original team's perspective.
5. Choose the action with the best worst-case score.

The evaluation prioritizes terminal results, dominance, controlled territory,
pressure, deployed roster strength, overlapping support, mobility, retreat
space, and useful Anchor placement. Seeded tie-breaking prevents repetitive play
while preserving reproducible tests and replays.

Search begins on the main thread with a strict time budget. It moves to a Web
Worker when profiling shows that deeper search affects animation or input.

## Presentation

AI turns use the same preview and confirmation language as human turns. The
chosen piece, projected influence, action, and retreats remain visible long
enough to understand. The AI never teleports pieces or bypasses resolution.

## Future difficulty levels

- Easy chooses among several reasonable one-ply actions.
- Standard uses the initial two-ply search.
- Hard uses iterative deepening, alpha-beta pruning, and a transposition table.

Only Standard is required for the first playable rules prototype.

## Headless self-play

The project includes a Node-based AI-versus-AI runner that records:

- Win rate by starting side
- Average and percentile match length
- Territory progression
- Dominance attempts and successful defenses
- Routes per team and unit type
- Deploy, movement, and stance-action frequency
- Draw and repeated-state frequency

Self-play results guide tuning but do not replace human playtests.

## Correctness tests

- Every selected AI action is legal.
- Search does not mutate its input state.
- A fixed seed produces a fixed decision.
- The AI takes an immediate win and blocks an immediate loss.
- Retreat plans contain unique, legal destinations.
- Headless matches always terminate at victory or the round limit.

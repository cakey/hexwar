# Architecture

HexWar separates deterministic game rules from browser rendering so each side
can evolve without coupling gameplay to a graphics framework.

## Runtime flow

1. React mounts `GameEngine` and renders snapshots into the HUD.
2. `GameEngine` translates pointer input into board coordinates.
3. `GameModel` validates the command and returns a transition describing any
   piece movement.
4. The engine animates that transition, synchronizes selection and territory,
   and publishes a fresh immutable snapshot to React.
5. Three.js renders frames independently from rule evaluation.

## Source layout

- `src/model/game.ts` owns pieces, turns, movement budgets, occupancy,
  influence, territory, and preview calculations.
- `src/model/hex.ts` owns coordinate conversion, adjacency, distance, and path
  finding.
- `src/rendering/game-engine.ts` owns Three.js resources, animation, raycasting,
  and adapting model transitions to the scene.
- `src/main.tsx` owns application lifecycle and the React HUD.
- `src/model/*.test.ts` exercises deterministic rules without a DOM or WebGL.
- `e2e/` verifies the production build with a real browser and WebGL context.

## Design rules

- The model must stay deterministic and side-effect free outside its own state.
- Model snapshots must not expose mutable internal arrays or objects.
- Rendering may interpolate movement, but the model remains authoritative.
- User actions enter through model commands; render objects do not mutate rules.
- New rules need model tests. New assembled user flows need Playwright coverage.

## Likely extension points

- Define match phases and win conditions in `GameModel`.
- Represent units with data-driven stats instead of renderer-specific classes.
- Serialize snapshots and commands for save games, replays, or networking.
- Add seeded randomness at the model boundary when combat requires it.

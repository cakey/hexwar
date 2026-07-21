# Architecture

HexWar separates deterministic game rules from browser rendering so each side
can evolve without coupling gameplay to a graphics framework.

## Runtime flow

1. React mounts `GameEngine` and renders snapshots into the HUD.
2. `GameEngine` translates pointer input into board coordinates.
3. The pure rules engine enumerates legal actions, validates the selected
   action, and returns a new serializable state.
4. The browser engine animates that transition, synchronizes selection and territory,
   and publishes a fresh immutable snapshot to React.
5. Three.js renders frames independently from rule evaluation.

## Source layout

- `src/model/game.ts` owns serializable state, legal actions, influence,
  pressure, retreats, cooldowns, turn resolution, and victory.
- `src/model/ai.ts` owns deterministic evaluation and bounded two-ply search.
- `src/model/simulation.ts` runs headless matches for regression and balance data.
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

## Extension points

- Persist `GameState` plus action keys for save games and replay timelines.
- Move AI search into a Web Worker if deeper difficulty levels need larger trees.
- Add map definitions around the existing board-coordinate array.
- Add online turns by transporting actions and verifying them with `isActionLegal`.

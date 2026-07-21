# Contributing to HexWar

## First-time setup

1. Install the Node.js version from `.nvmrc` or `.node-version`.
2. Run `npm ci` to install the locked dependency graph.
3. Run `npm run e2e:install` once to install the isolated Playwright browser.
4. Run `npm run dev` and open the URL printed by Vite.

The project does not require global npm packages or external services.

## Development loop

- Keep game rules independent from React and Three.js wherever possible.
- Add unit tests for rule changes and an end-to-end test for user-visible behavior.
- Run `npm run check:quick` while iterating.
- Run `npm run check` before opening a pull request.
- Run `npm run format` when formatting checks fail.

## Commit structure

Prefer small, focused commits that leave the build passing. Separate tooling,
refactors, and behavior changes when practical. Use an imperative subject line,
such as `Add turn timer` or `Prevent movement through occupied tiles`.

## Project boundaries

- `src/model/` contains deterministic game state and rules. It must not depend on
  React, Three.js, browser globals, or wall-clock time.
- `src/rendering/` adapts model state to Three.js and handles pointer input.
- React components render the HUD and send commands to the game engine.
- `e2e/` verifies the assembled production application in a real browser.

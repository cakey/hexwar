# HexWar

A small turn-based strategy game on a hexagonal battlefield. This is a modernized
version of the original 2015 prototype, now built with TypeScript, React,
Three.js, Vite, and Vitest.

## Requirements

- Node.js 22.12 or newer (the exact development version is in `.nvmrc`)
- npm 10.9 or newer

## Development

```sh
npm ci
npm run e2e:install
npm run dev
```

Vite prints the local development URL, normally <http://localhost:5173>.

## Commands

- `npm run dev` starts the development server with hot reload.
- `npm run dev:host` exposes the development server for testing on another device.
- `npm test` runs the hex-grid unit tests once.
- `npm run test:coverage` enforces coverage thresholds for deterministic game rules.
- `npm run test:e2e` launches an isolated headless browser and verifies WebGL rendering.
- `npm run simulate -- --games=10` runs seeded AI-vs-AI matches for balance feedback.
- `npm run e2e:install` installs Playwright's browser into the project cache once.
- `npm run lint` checks the TypeScript, JavaScript, and React components.
- `npm run format` formats supported project files with Prettier.
- `npm run typecheck` runs the strict TypeScript compiler without emitting files.
- `npm run build` creates a production build in `dist/`.
- `npm run check:quick` runs formatting, lint, type checking, and unit tests.
- `npm run check` also builds and verifies the app in Playwright.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and
project boundaries, and [docs/architecture.md](./docs/architecture.md) for the
runtime design and extension points.

The agreed rules live in [docs/game-design.md](./docs/game-design.md), with the
opponent and balance strategy in [docs/ai-design.md](./docs/ai-design.md).

## How to play

Violet goes first and takes one action: move a piece, place a ready reserve,
change the Anchor's stance, or pass. Every action is previewed on the board and
must be confirmed. Scouts travel quickly, Standards project broad influence,
and a deployed Anchor is immobile but exceptionally strong.

Tiles belong to the team with the greater nearby influence. A piece standing in
enemy-controlled territory is pressured; if its owner cannot relieve that
pressure on their next action, it retreats for free or is routed into cooldown.
Control 60% of the board through the opponent's response to win. The default
mode is Violet versus the Crimson AI; hotseat play is available from the top
right controls.

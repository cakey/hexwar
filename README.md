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
- `npm test` runs the hex-grid unit tests once.
- `npm run test:e2e` launches an isolated headless browser and verifies WebGL rendering.
- `npm run e2e:install` installs Playwright's browser into the project cache once.
- `npm run lint` checks the TypeScript, JavaScript, and React components.
- `npm run format` formats supported project files with Prettier.
- `npm run typecheck` runs the strict TypeScript compiler without emitting files.
- `npm run build` creates a production build in `dist/`.
- `npm run check:quick` runs formatting, lint, type checking, and unit tests.
- `npm run check` also builds and verifies the app in Playwright.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and
project boundaries.

## How to play

Violet goes first. Select one of the current team's pieces, then select a
highlighted destination. Each team gets four hexes of movement per turn.
Territory is claimed automatically based on the nearby pieces' influence.

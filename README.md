# HexWar

A small turn-based strategy game on a hexagonal battlefield. This is a modernized
version of the original 2015 prototype, now built with React, Three.js, Vite, and
Vitest.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Development

```sh
npm install
npm run e2e:install
npm run dev
```

Vite prints the local development URL, normally <http://localhost:5173>.

## Commands

- `npm run dev` starts the development server with hot reload.
- `npm test` runs the hex-grid unit tests once.
- `npm run test:e2e` launches an isolated headless browser and verifies WebGL rendering.
- `npm run e2e:install` installs Playwright's browser into the project cache once.
- `npm run lint` checks the JavaScript and JSX.
- `npm run build` creates a production build in `dist/`.
- `npm run check` runs lint, tests, and the production build.

## How to play

Violet goes first. Select one of the current team's pieces, then select a
highlighted destination. Each team gets four hexes of movement per turn.
Territory is claimed automatically based on the nearby pieces' influence.

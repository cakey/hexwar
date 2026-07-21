import { chooseAction } from './ai.js';
import { actionKey, applyLegalAction, createInitialState } from './game.js';
import type { AiOptions } from './ai.js';
import type { GameState, Winner } from './game.js';

export interface SimulationResult {
  winner: Winner;
  turns: number;
  actions: string[];
  routedPieces: number;
  finalTerritory: [number, number, number];
}

export function runSimulation(options: AiOptions = {}): SimulationResult {
  let state = createInitialState();
  const actions: string[] = [];
  let routedPieces = 0;
  let steps = 0;

  while (state.winner === null && steps < 200) {
    const action = chooseAction(state, { ...options, seed: (options.seed ?? 1) + steps });
    if (!action) break;
    if (action.type === 'retreat') {
      routedPieces += Object.values(action.destinations).filter((hex) => hex === null).length;
    }
    actions.push(actionKey(action));
    state = applyLegalAction(state, action);
    steps += 1;
  }

  return {
    winner: state.winner,
    turns: state.turn,
    actions,
    routedPieces,
    finalTerritory: [...state.territoryCounts],
  };
}

export function summarizeSimulations(results: SimulationResult[]): string {
  const violet = results.filter(({ winner }) => winner === 0).length;
  const crimson = results.filter(({ winner }) => winner === 1).length;
  const draws = results.filter(({ winner }) => winner === 'draw' || winner === null).length;
  const averageTurns =
    results.reduce((total, { turns }) => total + turns, 0) / Math.max(results.length, 1);
  const averageRoutes =
    results.reduce((total, { routedPieces }) => total + routedPieces, 0) /
    Math.max(results.length, 1);
  return [
    `${results.length} games`,
    `Violet ${violet} · Crimson ${crimson} · Draw ${draws}`,
    `Average turns ${averageTurns.toFixed(1)}`,
    `Average routed pieces ${averageRoutes.toFixed(1)}`,
  ].join('\n');
}

export function simulateFrom(state: GameState, options: AiOptions = {}): GameState {
  const action = chooseAction(state, options);
  return action ? applyLegalAction(state, action) : state;
}

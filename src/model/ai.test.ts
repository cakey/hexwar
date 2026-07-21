import { describe, expect, it } from 'vitest';
import { chooseAction, evaluateState } from './ai.js';
import {
  actionKey,
  applyAction,
  cloneGameState,
  createInitialState,
  getLegalActions,
  isActionLegal,
} from './game.js';
import { runSimulation, simulateFrom, summarizeSimulations } from './simulation.js';

describe('computer player', () => {
  it('chooses a legal deterministic action without mutating state', () => {
    const state = createInitialState();
    const original = cloneGameState(state);
    const first = chooseAction(state, { depth: 1, seed: 42 });
    const second = chooseAction(state, { depth: 1, seed: 42 });

    expect(first).not.toBeNull();
    expect(actionKey(first!)).toBe(actionKey(second!));
    expect(isActionLegal(state, first!)).toBe(true);
    expect(state).toEqual(original);
  });

  it('values territory, pressure, and terminal wins for its perspective', () => {
    const state = createInitialState();
    const move = getLegalActions(state).find(({ type }) => type === 'move')!;
    const next = applyAction(state, move);
    expect(Number.isFinite(evaluateState(next, 0))).toBe(true);

    next.winner = 0;
    expect(evaluateState(next, 0)).toBe(100_000);
    expect(evaluateState(next, 1)).toBe(-100_000);
    next.winner = 'draw';
    expect(evaluateState(next, 0)).toBe(0);
  });

  it('can advance supplied state through the simulation policy', () => {
    const state = createInitialState();
    const next = simulateFrom(state, { depth: 1, seed: 2 });
    expect(next.turn).toBeGreaterThan(state.turn);
  });

  it('plays a complete reproducible headless match', () => {
    const first = runSimulation({ depth: 1, maxCandidates: 8, seed: 7 });
    expect(first.winner).not.toBeNull();
    expect(first.turns).toBeLessThanOrEqual(80);
    expect(first.finalTerritory.reduce((total, count) => total + count, 0)).toBe(113);
    expect(summarizeSimulations([first])).toContain('1 games');
  }, 15_000);
});

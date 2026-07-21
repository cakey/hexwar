import { describe, expect, it } from 'vitest';
import {
  actionKey,
  applyAction,
  cloneGameState,
  createBoardHexes,
  createInitialState,
  DOMINANCE_PERCENTAGE,
  getLegalActions,
  getLegalNormalActions,
  getPiece,
  getTile,
  previewAction,
  recalculateGameState,
  roundNumber,
  territoryPercentage,
} from './game.js';
import { distance, hexKey } from './hex.js';
import type {
  DeployAction,
  GameAction,
  GameState,
  MoveAction,
  PieceState,
  PieceType,
  Team,
} from './game.js';
import type { Hex } from './hex.js';

function scenario(
  deployed: Array<{
    id: string;
    team: Team;
    type: PieceType;
    hex: Hex;
    stance?: 'packed' | 'deployed';
  }>,
  board = createBoardHexes(),
): GameState {
  const state = createInitialState();
  state.board = board;
  for (const piece of state.pieces) {
    piece.status = 'reserve';
    piece.hex = null;
    piece.stance = 'packed';
    piece.cooldownTurns = 0;
  }
  deployed.forEach((setup, index) => {
    const piece = state.pieces[index];
    Object.assign(piece, setup, {
      status: 'deployed',
      hex: [...setup.hex],
      stance: setup.stance ?? 'packed',
    } satisfies Partial<PieceState>);
  });
  state.activeTeam = 0;
  state.turn = 1;
  state.phase = 'action';
  state.pendingRetreatIds = [];
  state.dominance = null;
  state.winner = null;
  return recalculateGameState(state);
}

function findAction<T extends GameAction['type']>(
  state: GameState,
  type: T,
  predicate: (action: Extract<GameAction, { type: T }>) => boolean = () => true,
): Extract<GameAction, { type: T }> {
  const action = getLegalActions(state).find(
    (candidate): candidate is Extract<GameAction, { type: T }> =>
      candidate.type === type && predicate(candidate as Extract<GameAction, { type: T }>),
  );
  if (!action) throw new Error(`No ${type} action matched`);
  return action;
}

describe('game rules', () => {
  it('creates the expected staggered battlefield', () => {
    const board = createBoardHexes();
    expect(board).toHaveLength(85);
    expect(new Set(board.map(hexKey)).size).toBe(85);
    expect(board).toContainEqual([0, 6]);
    expect(board).not.toContainEqual([1, 6]);
  });

  it('starts with symmetric finite rosters', () => {
    const state = createInitialState();
    expect(state.pieces).toHaveLength(10);
    for (const team of [0, 1] as const) {
      const roster = state.pieces.filter((piece) => piece.team === team);
      expect(roster.filter(({ status }) => status === 'deployed')).toHaveLength(3);
      expect(roster.filter(({ status }) => status === 'reserve')).toHaveLength(2);
      expect(roster.map(({ type }) => type).sort()).toEqual([
        'anchor',
        'scout',
        'scout',
        'standard',
        'standard',
      ]);
    }
    expect(state.territoryCounts[0]).toBe(state.territoryCounts[1]);
    expect(state.territoryCounts.reduce((sum, count) => sum + count, 0)).toBe(85);
  });

  it('uses readable weighted influence rings', () => {
    const state = scenario([{ id: 'test-standard', team: 0, type: 'standard', hex: [4, 3] }]);
    expect(getTile(state, [4, 3])?.influence).toEqual([3, 0]);
    expect(state.tiles.find((tile) => distance(tile.hex, [4, 3]) === 1)?.influence).toEqual([2, 0]);
    expect(state.tiles.find((tile) => distance(tile.hex, [4, 3]) === 2)?.influence).toEqual([1, 0]);
    expect(state.tiles.find((tile) => distance(tile.hex, [4, 3]) === 3)?.influence).toEqual([0, 0]);
  });

  it('offers one move, deployment, stance change, or pass as a normal action', () => {
    const state = createInitialState();
    const actions = getLegalNormalActions(state);

    expect(actions).toContainEqual({
      type: 'stance',
      pieceId: 'violet-anchor-1',
      stance: 'deployed',
    });
    expect(actions.some(({ type }) => type === 'move')).toBe(true);
    expect(actions.some(({ type }) => type === 'deploy')).toBe(true);
    expect(actions).toContainEqual({ type: 'pass' });
  });

  it('gives Scouts two movement and Standards one', () => {
    const state = createInitialState();
    const scoutMoves = getLegalNormalActions(state).filter(
      (action): action is MoveAction =>
        action.type === 'move' && action.pieceId === 'violet-scout-1',
    );
    const standardMoves = getLegalNormalActions(state).filter(
      (action): action is MoveAction =>
        action.type === 'move' && action.pieceId === 'violet-standard-1',
    );

    expect(scoutMoves.some(({ to }) => distance([0, 1], to) === 2)).toBe(true);
    expect(standardMoves.every(({ to }) => distance([0, 5], to) === 1)).toBe(true);
  });

  it('commits exactly one action and hands over the turn', () => {
    const initial = createInitialState();
    const action = findAction(initial, 'move', ({ pieceId }) => pieceId === 'violet-scout-1');
    const next = applyAction(initial, action);

    expect(next.activeTeam).toBe(1);
    expect(next.turn).toBe(2);
    expect(roundNumber(next)).toBe(1);
    expect(getPiece(next, action.pieceId)?.hex).toEqual(action.to);
    expect(next.lastAction).toEqual(action);
  });

  it('previews without mutating the live state', () => {
    const initial = createInitialState();
    const before = cloneGameState(initial);
    const action = findAction(initial, 'stance');
    const preview = previewAction(initial, action);

    expect(initial).toEqual(before);
    expect(getPiece(preview, 'violet-anchor-1')?.stance).toBe('deployed');
    expect(getPiece(initial, 'violet-anchor-1')?.stance).toBe('packed');
  });

  it('deploys ready reserves only into safe home-zone tiles', () => {
    const initial = createInitialState();
    const deployments = getLegalNormalActions(initial).filter(
      (action): action is DeployAction =>
        action.type === 'deploy' && action.pieceId === 'violet-scout-2',
    );

    expect(deployments.length).toBeGreaterThan(0);
    expect(deployments.every(({ to }) => to[0] <= 1)).toBe(true);
    const next = applyAction(initial, deployments[0]);
    expect(getPiece(next, 'violet-scout-2')).toMatchObject({
      status: 'deployed',
      cooldownTurns: 0,
      hex: deployments[0].to,
    });
  });

  it('marks a piece as pressured when its tile is enemy-controlled', () => {
    const state = scenario([
      { id: 'violet-standard', team: 0, type: 'standard', hex: [4, 3] },
      { id: 'crimson-standard-a', team: 1, type: 'standard', hex: [5, 3] },
      { id: 'crimson-standard-b', team: 1, type: 'standard', hex: [5, 2] },
    ]);

    expect(getTile(state, [4, 3])).toMatchObject({ influence: [3, 4], controller: 1 });
    expect(getPiece(state, 'violet-standard')?.pressured).toBe(true);
  });

  it('allows a normal response before requiring free safe retreats', () => {
    let state = scenario([
      { id: 'violet-standard', team: 0, type: 'standard', hex: [4, 3] },
      { id: 'crimson-standard-a', team: 1, type: 'standard', hex: [5, 3] },
      { id: 'crimson-standard-b', team: 1, type: 'standard', hex: [5, 2] },
    ]);

    state = applyAction(state, { type: 'pass' });
    expect(state.phase).toBe('retreat');
    expect(state.activeTeam).toBe(0);
    expect(state.pendingRetreatIds).toEqual(['violet-standard']);

    const retreat = findAction(state, 'retreat');
    const destination = retreat.destinations['violet-standard'];
    expect(destination).not.toBeNull();
    state = applyAction(state, retreat);
    expect(state.activeTeam).toBe(1);
    expect(getPiece(state, 'violet-standard')?.pressured).toBe(false);
  });

  it('routes a trapped piece, cools it for its next turn, then returns it to reserve', () => {
    let state = scenario([
      { id: 'violet-scout', team: 0, type: 'scout', hex: [0, 0] },
      {
        id: 'crimson-anchor',
        team: 1,
        type: 'anchor',
        hex: [1, 0],
        stance: 'deployed',
      },
    ]);

    state = applyAction(state, { type: 'pass' });
    const retreat = findAction(state, 'retreat');
    expect(retreat.destinations['violet-scout']).toBeNull();
    state = applyAction(state, retreat);
    expect(getPiece(state, 'violet-scout')).toMatchObject({
      status: 'cooling',
      cooldownTurns: 1,
      hex: null,
    });

    state = applyAction(state, { type: 'pass' });
    expect(state.activeTeam).toBe(0);
    expect(
      getLegalActions(state).some(
        (action) => action.type === 'deploy' && action.pieceId === 'violet-scout',
      ),
    ).toBe(false);
    state = applyAction(state, { type: 'pass' });
    expect(getPiece(state, 'violet-scout')?.status).toBe('reserve');
    state = applyAction(state, { type: 'pass' });
    expect(state.activeTeam).toBe(0);
    expect(
      getLegalActions(state).some(
        (action) => action.type === 'deploy' && action.pieceId === 'violet-scout',
      ),
    ).toBe(true);
  });

  it('packs an Anchor when it retreats', () => {
    let state = scenario([
      {
        id: 'violet-anchor',
        team: 0,
        type: 'anchor',
        hex: [4, 3],
        stance: 'deployed',
      },
      {
        id: 'crimson-anchor-a',
        team: 1,
        type: 'anchor',
        hex: [5, 3],
        stance: 'deployed',
      },
      {
        id: 'crimson-anchor-b',
        team: 1,
        type: 'anchor',
        hex: [5, 2],
        stance: 'deployed',
      },
    ]);
    state = applyAction(state, { type: 'pass' });
    state = applyAction(state, findAction(state, 'retreat'));
    expect(getPiece(state, 'violet-anchor')?.stance).toBe('packed');
  });

  it('starts dominance at sixty percent and wins after the response turn', () => {
    let state = scenario(
      [{ id: 'violet-standard', team: 0, type: 'standard', hex: [0, 0] }],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    );
    expect(territoryPercentage(state, 0)).toBeGreaterThanOrEqual(DOMINANCE_PERCENTAGE);

    state = applyAction(state, { type: 'pass' });
    expect(state.dominance?.team).toBe(0);
    expect(state.winner).toBeNull();
    state = applyAction(state, { type: 'pass' });
    expect(state.winner).toBe(0);
    expect(state.phase).toBe('game-over');
    expect(getLegalActions(state)).toEqual([]);
  });

  it('rejects illegal actions with a useful identifier', () => {
    const action: GameAction = { type: 'move', pieceId: 'missing', to: [6, 3] };
    expect(() => applyAction(createInitialState(), action)).toThrow(actionKey(action));
  });
});

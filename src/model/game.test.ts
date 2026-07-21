import { describe, expect, it } from 'vitest';
import { createBoardHexes, GameModel, MOVES_PER_TURN } from './game.js';
import { hexKey } from './hex.js';

describe('game model', () => {
  it('creates the expected staggered battlefield', () => {
    const board = createBoardHexes();

    expect(board).toHaveLength(85);
    expect(new Set(board.map(hexKey)).size).toBe(85);
    expect(board).toContainEqual([0, 6]);
    expect(board).not.toContainEqual([1, 6]);
  });

  it('starts with two balanced teams and deterministic territory', () => {
    const snapshot = new GameModel().snapshot();

    expect(snapshot).toMatchObject({
      currentTeamTurn: 0,
      teamName: 'Violet',
      turn: 1,
      movesRemaining: MOVES_PER_TURN,
      selectedPieceId: null,
      totalInfluence: [16, 16, 53],
    });
    expect(snapshot.pieces).toHaveLength(6);
  });

  it('only selects a piece belonging to the active team', () => {
    const game = new GameModel();

    expect(game.selectHex([12, 1])).toEqual({ changed: false });
    expect(game.selectHex([0, 1])).toEqual({ changed: true });
    expect(game.snapshot().selectedPieceId).toBe('violet-1');
  });

  it('moves a selected piece and spends its path cost', () => {
    const game = new GameModel();
    game.selectHex([0, 1]);

    const transition = game.selectHex([1, 1]);
    const snapshot = game.snapshot();

    expect(transition).toMatchObject({
      changed: true,
      movedPiece: {
        id: 'violet-1',
        path: [
          [0, 1],
          [1, 1],
        ],
      },
    });
    expect(snapshot.pieces.find(({ id }) => id === 'violet-1')?.hex).toEqual([1, 1]);
    expect(snapshot.movesRemaining).toBe(3);
    expect(snapshot.selectedPieceId).toBeNull();
  });

  it('does not move onto an occupied tile or beyond the movement budget', () => {
    const game = new GameModel();
    game.selectHex([0, 1]);

    expect(game.selectHex([0, 3])).toEqual({ changed: false });
    expect(game.selectHex([6, 1])).toEqual({ changed: false });
    expect(game.snapshot().selectedPieceId).toBe('violet-1');
  });

  it('advances the turn after all movement is spent', () => {
    const game = new GameModel();
    game.selectHex([0, 1]);

    expect(game.selectHex([4, 1]).changed).toBe(true);
    expect(game.snapshot()).toMatchObject({
      currentTeamTurn: 1,
      teamName: 'Crimson',
      turn: 2,
      movesRemaining: MOVES_PER_TURN,
    });
  });

  it('supports deselection and a complete reset', () => {
    const game = new GameModel();
    game.selectHex([0, 1]);
    expect(game.deselect()).toBe(true);
    expect(game.deselect()).toBe(false);

    game.selectHex([0, 1]);
    game.selectHex([1, 1]);
    game.reset();

    expect(game.snapshot()).toMatchObject({
      currentTeamTurn: 0,
      turn: 1,
      movesRemaining: MOVES_PER_TURN,
      selectedPieceId: null,
      totalInfluence: [16, 16, 53],
    });
    expect(game.snapshot().pieces.find(({ id }) => id === 'violet-1')?.hex).toEqual([0, 1]);
  });

  it('returns path and range previews without changing state', () => {
    const game = new GameModel();
    expect(game.previewsFor([1, 1]).highlight).toEqual([[1, 1]]);

    game.selectHex([0, 1]);
    const preview = game.previewsFor([1, 1]);

    expect(preview.onPath).toEqual([[0, 1]]);
    expect(preview.highlight).toEqual([[1, 1]]);
    expect(game.snapshot().pieces.find(({ id }) => id === 'violet-1')?.hex).toEqual([0, 1]);
  });

  it('does not expose mutable model coordinates through snapshots', () => {
    const game = new GameModel();
    const snapshot = game.snapshot();
    snapshot.pieces[0].hex[0] = 99;

    expect(game.snapshot().pieces[0].hex).toEqual([0, 1]);
  });
});

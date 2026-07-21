import { describe, expect, it } from 'vitest';
import { distance, getAdjacent, shortestPath } from './hex.js';
import type { Hex } from './hex.js';

describe('hex algorithms', () => {
  describe('shortestPath', () => {
    it('returns the start for matching endpoints', () => {
      expect(shortestPath([1, 1], [1, 1])).toEqual([[1, 1]]);
    });

    it('finds a neighboring tile', () => {
      expect(shortestPath([1, 1], [1, 2])).toEqual([
        [1, 1],
        [1, 2],
      ]);
    });

    it('finds a deterministic path over many tiles', () => {
      expect(shortestPath([1, 1], [7, 9])).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
        [1, 6],
        [2, 7],
        [3, 7],
        [4, 8],
        [5, 8],
        [6, 9],
        [7, 9],
      ]);
    });

    it('rejects missing endpoints', () => {
      expect(() => shortestPath([1, 1], undefined as unknown as Hex)).toThrow(/missing/);
    });

    it('stays within valid tiles', () => {
      const validHexes = new Set(['0,0', '0,1', '0,2', '1,2', '2,2', '2,1', '2,0']);
      expect(shortestPath([0, 0], [2, 0], validHexes)).toEqual([
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [2, 1],
        [2, 0],
      ]);
    });

    it('returns undefined when no valid path exists', () => {
      expect(shortestPath([0, 0], [2, 0], new Set(['0,0', '2,0']))).toBeUndefined();
    });
  });

  describe('getAdjacent', () => {
    it('uses offset coordinates for even columns', () => {
      expect(getAdjacent([2, 3])).toContainEqual([1, 2]);
      expect(getAdjacent([2, 3])).toContainEqual([3, 3]);
    });
  });

  describe('distance', () => {
    it('is zero for the same hex', () => {
      expect(distance([4, 1], [4, 1])).toBe(0);
    });

    it('calculates offset-grid distance', () => {
      expect(distance([4, 1], [7, 4])).toBe(5);
    });
  });
});

import { distance, hexKey, shortestPath } from './hex.js';
import type { Hex } from './hex.js';

export type Team = 0 | 1;

export const TEAM_NAMES = ['Violet', 'Crimson'] as const;
export const MOVES_PER_TURN = 4;
export const BOARD_COLUMNS = 13;
export const BOARD_ROWS = 7;

export interface PieceSnapshot {
  id: string;
  team: Team;
  hex: Hex;
}

export interface GameSnapshot {
  currentTeamTurn: Team;
  teamName: (typeof TEAM_NAMES)[Team];
  turn: number;
  movesRemaining: number;
  totalInfluence: [number, number, number];
  selectedPieceId: string | null;
  hasSelection: boolean;
  pieces: PieceSnapshot[];
}

export interface PreviewMap {
  onPath: Hex[];
  outOfRange: Hex[];
  highlight: Hex[];
}

export interface GameTransition {
  changed: boolean;
  movedPiece?: {
    id: string;
    path: Hex[];
  };
}

const STARTING_PIECES: ReadonlyArray<PieceSnapshot> = [
  { id: 'violet-1', team: 0, hex: [0, 1] },
  { id: 'violet-2', team: 0, hex: [0, 3] },
  { id: 'violet-3', team: 0, hex: [0, 5] },
  { id: 'crimson-1', team: 1, hex: [12, 1] },
  { id: 'crimson-2', team: 1, hex: [12, 3] },
  { id: 'crimson-3', team: 1, hex: [12, 5] },
];

const cloneHex = ([column, row]: Hex): Hex => [column, row];

export function createBoardHexes(columns = BOARD_COLUMNS, rows = BOARD_ROWS): Hex[] {
  const hexes: Hex[] = [];
  for (let column = 0; column < columns; column += 1) {
    const height = column % 2 === 0 ? rows : rows - 1;
    for (let row = 0; row < height; row += 1) {
      hexes.push([column, row]);
    }
  }
  return hexes;
}

export class GameModel {
  private readonly boardHexes: Hex[];
  private pieces: PieceSnapshot[] = [];
  private selectedPieceId: string | null = null;
  private currentTeamTurn: Team = 0;
  private turn = 1;
  private movesRemaining = MOVES_PER_TURN;
  private territory = new Map<string, Team | null>();
  private totalInfluence: [number, number, number] = [0, 0, 0];

  constructor(boardHexes = createBoardHexes()) {
    this.boardHexes = boardHexes.map(cloneHex);
    this.reset();
  }

  reset(): void {
    this.pieces = STARTING_PIECES.map((piece) => ({
      ...piece,
      hex: cloneHex(piece.hex),
    }));
    this.selectedPieceId = null;
    this.currentTeamTurn = 0;
    this.turn = 1;
    this.movesRemaining = MOVES_PER_TURN;
    this.updateTerritory();
  }

  snapshot(): GameSnapshot {
    return {
      currentTeamTurn: this.currentTeamTurn,
      teamName: TEAM_NAMES[this.currentTeamTurn],
      turn: this.turn,
      movesRemaining: this.movesRemaining,
      totalInfluence: [...this.totalInfluence],
      selectedPieceId: this.selectedPieceId,
      hasSelection: this.selectedPieceId !== null,
      pieces: this.pieces.map((piece) => ({ ...piece, hex: cloneHex(piece.hex) })),
    };
  }

  getTerritory(): ReadonlyMap<string, Team | null> {
    return this.territory;
  }

  selectHex(selectedHex: Hex): GameTransition {
    const selectedPiece = this.getSelectedPiece();
    if (!selectedPiece) {
      const piece = this.pieces.find(({ hex }) => hexKey(hex) === hexKey(selectedHex));
      if (piece?.team !== this.currentTeamTurn) return { changed: false };

      this.selectedPieceId = piece.id;
      return { changed: true };
    }

    const path = shortestPath(selectedPiece.hex, selectedHex, this.availableHexes());
    if (!path || path.length - 1 > this.movesRemaining) return { changed: false };

    const moveCost = path.length - 1;
    selectedPiece.hex = cloneHex(path.at(-1)!);
    this.selectedPieceId = null;
    this.movesRemaining -= moveCost;
    this.updateTerritory();
    if (this.movesRemaining === 0) this.nextTurn();

    return {
      changed: true,
      movedPiece: { id: selectedPiece.id, path: path.map(cloneHex) },
    };
  }

  deselect(): boolean {
    if (this.selectedPieceId === null) return false;
    this.selectedPieceId = null;
    return true;
  }

  previewsFor(hoveredHex?: Hex): PreviewMap {
    const previews: PreviewMap = { onPath: [], outOfRange: [], highlight: [] };
    if (!hoveredHex) return previews;

    const selectedPiece = this.getSelectedPiece();
    if (!selectedPiece) {
      previews.highlight.push(hoveredHex);
      return previews;
    }

    const available = this.availableHexes();
    let path = shortestPath(selectedPiece.hex, hoveredHex, available);
    let valid = true;
    if (!path) {
      available.add(hexKey(hoveredHex));
      path = shortestPath(selectedPiece.hex, hoveredHex, available);
      valid = false;
    }

    if (!path) return previews;
    path.forEach((hex, index) => {
      if (!valid || index > this.movesRemaining) previews.outOfRange.push(hex);
      else if (index === path.length - 1) previews.highlight.push(hex);
      else previews.onPath.push(hex);
    });
    return previews;
  }

  private getSelectedPiece(): PieceSnapshot | undefined {
    return this.pieces.find(({ id }) => id === this.selectedPieceId);
  }

  private availableHexes(): Set<string> {
    const available = new Set(this.boardHexes.map(hexKey));
    for (const piece of this.pieces) available.delete(hexKey(piece.hex));
    const selectedPiece = this.getSelectedPiece();
    if (selectedPiece) available.add(hexKey(selectedPiece.hex));
    return available;
  }

  private nextTurn(): void {
    this.selectedPieceId = null;
    this.currentTeamTurn = this.currentTeamTurn === 0 ? 1 : 0;
    this.turn += 1;
    this.movesRemaining = MOVES_PER_TURN;
  }

  private updateTerritory(): void {
    const territory = new Map<string, Team | null>();
    const totals: [number, number, number] = [0, 0, 0];

    for (const hex of this.boardHexes) {
      const influence: [number, number] = [0, 0];
      for (const piece of this.pieces) {
        influence[piece.team] += 2 ** (5 - distance(piece.hex, hex));
      }

      let team: Team | null = null;
      if (influence[0] >= influence[1] + 6 && influence[0] >= 16) team = 0;
      if (influence[1] >= influence[0] + 6 && influence[1] >= 16) team = 1;
      territory.set(hexKey(hex), team);
      totals[team === null ? 2 : team] += 1;
    }

    this.territory = territory;
    this.totalInfluence = totals;
  }
}

import { distance, hexKey, shortestPath } from './hex.js';
import type { Hex } from './hex.js';

export type Team = 0 | 1;
export type PieceType = 'scout' | 'standard' | 'anchor';
export type PieceStatus = 'deployed' | 'reserve' | 'cooling';
export type AnchorStance = 'packed' | 'deployed';
export type MatchPhase = 'action' | 'retreat' | 'game-over';
export type Winner = Team | 'draw' | null;

export const TEAM_NAMES = ['Violet', 'Crimson'] as const;
export const BOARD_COLUMNS = 13;
export const BOARD_ROWS = 7;
export const DOMINANCE_PERCENTAGE = 0.6;
export const MAX_TURNS = 80;

export interface PieceState {
  id: string;
  team: Team;
  type: PieceType;
  status: PieceStatus;
  hex: Hex | null;
  stance: AnchorStance;
  cooldownTurns: number;
  pressured: boolean;
}

export interface TileState {
  hex: Hex;
  influence: [number, number];
  controller: Team | null;
}

export interface DominanceState {
  team: Team;
  startedOnTurn: number;
}

export interface GameState {
  version: 1;
  board: Hex[];
  pieces: PieceState[];
  tiles: TileState[];
  activeTeam: Team;
  turn: number;
  phase: MatchPhase;
  pendingRetreatIds: string[];
  territoryCounts: [number, number, number];
  dominance: DominanceState | null;
  winner: Winner;
  lastAction: GameAction | null;
}

export interface MoveAction {
  type: 'move';
  pieceId: string;
  to: Hex;
}

export interface DeployAction {
  type: 'deploy';
  pieceId: string;
  to: Hex;
}

export interface StanceAction {
  type: 'stance';
  pieceId: string;
  stance: AnchorStance;
}

export interface PassAction {
  type: 'pass';
}

export interface RetreatAction {
  type: 'retreat';
  destinations: Record<string, Hex | null>;
}

export type NormalAction = MoveAction | DeployAction | StanceAction | PassAction;
export type GameAction = NormalAction | RetreatAction;

export interface UnitDefinition {
  movement: number;
  influence: readonly number[];
}

const UNIT_DEFINITIONS: Record<PieceType, UnitDefinition> = {
  scout: { movement: 2, influence: [3, 2, 1] },
  standard: { movement: 1, influence: [4, 3, 2, 1] },
  anchor: { movement: 1, influence: [3, 2, 1] },
};

const DEPLOYED_ANCHOR: UnitDefinition = {
  movement: 0,
  influence: [5, 4, 3, 2, 1],
};

const otherTeam = (team: Team): Team => (team === 0 ? 1 : 0);
const cloneHex = ([column, row]: Hex): Hex => [column, row];

export function createBoardHexes(columns = BOARD_COLUMNS, rows = BOARD_ROWS): Hex[] {
  const hexes: Hex[] = [];
  for (let column = 0; column < columns; column += 1) {
    const height = column % 2 === 0 ? rows : rows - 1;
    for (let row = 0; row < height; row += 1) hexes.push([column, row]);
  }
  return hexes;
}

function startingPieces(): PieceState[] {
  const makePiece = (team: Team, type: PieceType, number: number, hex: Hex | null): PieceState => ({
    id: `${TEAM_NAMES[team].toLowerCase()}-${type}-${number}`,
    team,
    type,
    status: hex ? 'deployed' : 'reserve',
    hex: hex ? cloneHex(hex) : null,
    stance: 'packed',
    cooldownTurns: 0,
    pressured: false,
  });

  return [
    makePiece(0, 'scout', 1, [0, 1]),
    makePiece(0, 'anchor', 1, [0, 3]),
    makePiece(0, 'standard', 1, [0, 5]),
    makePiece(0, 'scout', 2, null),
    makePiece(0, 'standard', 2, null),
    makePiece(1, 'scout', 1, [12, 1]),
    makePiece(1, 'anchor', 1, [12, 3]),
    makePiece(1, 'standard', 1, [12, 5]),
    makePiece(1, 'scout', 2, null),
    makePiece(1, 'standard', 2, null),
  ];
}

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map(cloneHex),
    pieces: state.pieces.map((piece) => ({
      ...piece,
      hex: piece.hex ? cloneHex(piece.hex) : null,
    })),
    tiles: state.tiles.map((tile) => ({
      ...tile,
      hex: cloneHex(tile.hex),
      influence: [...tile.influence],
    })),
    pendingRetreatIds: [...state.pendingRetreatIds],
    territoryCounts: [...state.territoryCounts],
    dominance: state.dominance ? { ...state.dominance } : null,
    lastAction: state.lastAction ? cloneAction(state.lastAction) : null,
  };
}

export function cloneAction(action: GameAction): GameAction {
  if (action.type === 'move' || action.type === 'deploy') {
    return { ...action, to: cloneHex(action.to) };
  }
  if (action.type === 'retreat') {
    return {
      type: 'retreat',
      destinations: Object.fromEntries(
        Object.entries(action.destinations).map(([id, hex]) => [id, hex ? cloneHex(hex) : null]),
      ),
    };
  }
  return { ...action };
}

export function createInitialState(): GameState {
  return recalculateGameState({
    version: 1,
    board: createBoardHexes(),
    pieces: startingPieces(),
    tiles: [],
    activeTeam: 0,
    turn: 1,
    phase: 'action',
    pendingRetreatIds: [],
    territoryCounts: [0, 0, 0],
    dominance: null,
    winner: null,
    lastAction: null,
  });
}

export function getUnitDefinition(piece: PieceState): UnitDefinition {
  if (piece.type === 'anchor' && piece.stance === 'deployed') return DEPLOYED_ANCHOR;
  return UNIT_DEFINITIONS[piece.type];
}

export function getTile(state: GameState, hex: Hex): TileState | undefined {
  return state.tiles.find((tile) => hexKey(tile.hex) === hexKey(hex));
}

export function getPiece(state: GameState, pieceId: string): PieceState | undefined {
  return state.pieces.find(({ id }) => id === pieceId);
}

export function recalculateGameState(state: GameState): GameState {
  const deployed = state.pieces.filter(
    (piece): piece is PieceState & { hex: Hex } =>
      piece.status === 'deployed' && piece.hex !== null,
  );
  const counts: [number, number, number] = [0, 0, 0];
  const previousControllers = new Map(
    state.tiles.map((tile) => [hexKey(tile.hex), tile.controller] as const),
  );
  const tiles = state.board.map((hex): TileState => {
    const influence: [number, number] = [0, 0];
    for (const piece of deployed) {
      const value = getUnitDefinition(piece).influence[distance(piece.hex, hex)] ?? 0;
      influence[piece.team] += value;
    }
    const totalInfluence = influence[0] + influence[1];
    const controller: Team | null =
      totalInfluence === 0
        ? (previousControllers.get(hexKey(hex)) ?? null)
        : influence[0] === influence[1]
          ? null
          : influence[0] > influence[1]
            ? 0
            : 1;
    counts[controller === null ? 2 : controller] += 1;
    return { hex: cloneHex(hex), influence, controller };
  });

  const tileControllers = new Map(tiles.map((tile) => [hexKey(tile.hex), tile.controller]));
  const pieces = state.pieces.map((piece) => ({
    ...piece,
    pressured:
      piece.status === 'deployed' && piece.hex !== null
        ? tileControllers.get(hexKey(piece.hex)) === otherTeam(piece.team)
        : false,
  }));

  return { ...state, pieces, tiles, territoryCounts: counts };
}

function occupiedHexes(
  state: GameState,
  excludedIds: ReadonlySet<string> = new Set(),
): Set<string> {
  return new Set(
    state.pieces
      .filter(
        (piece): piece is PieceState & { hex: Hex } =>
          piece.status === 'deployed' && piece.hex !== null && !excludedIds.has(piece.id),
      )
      .map((piece) => hexKey(piece.hex)),
  );
}

function movementActions(state: GameState, piece: PieceState): MoveAction[] {
  if (piece.status !== 'deployed' || !piece.hex) return [];
  const movement = getUnitDefinition(piece).movement;
  if (movement === 0) return [];

  const occupied = occupiedHexes(state, new Set([piece.id]));
  const validHexes = new Set(state.board.map(hexKey).filter((key) => !occupied.has(key)));
  return state.board.flatMap((hex) => {
    if (occupied.has(hexKey(hex)) || hexKey(hex) === hexKey(piece.hex!)) return [];
    const path = shortestPath(piece.hex!, hex, validHexes);
    return path && path.length - 1 <= movement
      ? [{ type: 'move' as const, pieceId: piece.id, to: cloneHex(hex) }]
      : [];
  });
}

function isHomeZone(team: Team, [column]: Hex): boolean {
  return team === 0 ? column <= 1 : column >= BOARD_COLUMNS - 2;
}

function deploymentActions(state: GameState, piece: PieceState): DeployAction[] {
  if (piece.status !== 'reserve') return [];
  const occupied = occupiedHexes(state);
  const enemy = otherTeam(piece.team);
  return state.board.flatMap((hex) => {
    const tile = getTile(state, hex);
    return isHomeZone(piece.team, hex) && !occupied.has(hexKey(hex)) && tile?.controller !== enemy
      ? [{ type: 'deploy' as const, pieceId: piece.id, to: cloneHex(hex) }]
      : [];
  });
}

export function getLegalNormalActions(state: GameState): NormalAction[] {
  if (state.phase !== 'action' || state.winner !== null) return [];
  const actions: NormalAction[] = [];
  for (const piece of state.pieces.filter(({ team }) => team === state.activeTeam)) {
    actions.push(...movementActions(state, piece), ...deploymentActions(state, piece));
    if (piece.type === 'anchor' && piece.status === 'deployed') {
      actions.push({
        type: 'stance',
        pieceId: piece.id,
        stance: piece.stance === 'packed' ? 'deployed' : 'packed',
      });
    }
  }
  actions.push({ type: 'pass' });
  return actions;
}

function retreatMovesHome(team: Team, from: Hex, to: Hex): boolean {
  return team === 0 ? to[0] <= from[0] : to[0] >= from[0];
}

function geometricRetreatOptions(
  state: GameState,
  piece: PieceState & { hex: Hex },
  staticOccupied: ReadonlySet<string>,
): Hex[] {
  return state.board.filter(
    (hex) =>
      distance(piece.hex, hex) === 1 &&
      retreatMovesHome(piece.team, piece.hex, hex) &&
      !staticOccupied.has(hexKey(hex)),
  );
}

function getRetreatActions(state: GameState): RetreatAction[] {
  if (state.phase !== 'retreat' || state.pendingRetreatIds.length === 0) return [];
  const pendingSet = new Set(state.pendingRetreatIds);
  const pieces = state.pendingRetreatIds
    .map((id) => getPiece(state, id))
    .filter(
      (piece): piece is PieceState & { hex: Hex } =>
        piece?.status === 'deployed' && piece.hex !== null,
    );
  const staticOccupied = occupiedHexes(state, pendingSet);
  const plans: RetreatAction[] = [];

  const buildPlans = (index: number, destinations: Record<string, Hex | null>): void => {
    if (index < pieces.length) {
      const piece = pieces[index];
      const used = new Set(
        Object.values(destinations)
          .filter((hex): hex is Hex => hex !== null)
          .map(hexKey),
      );
      const options = geometricRetreatOptions(state, piece, staticOccupied).filter(
        (hex) => !used.has(hexKey(hex)),
      );
      for (const destination of [...options, null]) {
        buildPlans(index + 1, { ...destinations, [piece.id]: destination });
      }
      return;
    }

    const projected = cloneGameState(state);
    for (const piece of pieces) {
      const projectedPiece = getPiece(projected, piece.id)!;
      const destination = destinations[piece.id];
      if (destination) {
        projectedPiece.hex = cloneHex(destination);
        if (projectedPiece.type === 'anchor') projectedPiece.stance = 'packed';
      } else {
        projectedPiece.hex = null;
        projectedPiece.status = 'cooling';
        projectedPiece.cooldownTurns = 1;
        projectedPiece.stance = 'packed';
      }
    }
    const resolved = recalculateGameState(projected);
    const allDestinationsSafe = pieces.every((piece) => {
      const destination = destinations[piece.id];
      return destination === null || getPiece(resolved, piece.id)?.pressured === false;
    });
    if (allDestinationsSafe) plans.push({ type: 'retreat', destinations });
  };

  buildPlans(0, {});
  const fewestRoutes = Math.min(
    ...plans.map((plan) => Object.values(plan.destinations).filter((hex) => hex === null).length),
  );
  return plans.filter(
    (plan) =>
      Object.values(plan.destinations).filter((hex) => hex === null).length === fewestRoutes,
  );
}

export function getLegalActions(state: GameState): GameAction[] {
  return state.phase === 'retreat' ? getRetreatActions(state) : getLegalNormalActions(state);
}

export function actionKey(action: GameAction): string {
  if (action.type === 'move' || action.type === 'deploy') {
    return `${action.type}:${action.pieceId}:${hexKey(action.to)}`;
  }
  if (action.type === 'stance') return `${action.type}:${action.pieceId}:${action.stance}`;
  if (action.type === 'retreat') {
    const plans = Object.entries(action.destinations)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([id, hex]) => `${id}:${hex ? hexKey(hex) : 'route'}`)
      .join('|');
    return `retreat:${plans}`;
  }
  return 'pass';
}

export function isActionLegal(state: GameState, action: GameAction): boolean {
  const key = actionKey(action);
  return getLegalActions(state).some((candidate) => actionKey(candidate) === key);
}

function applyNormalAction(state: GameState, action: NormalAction): GameState {
  let next = cloneGameState(state);
  const dueToRetreat = new Set(
    next.pieces
      .filter(
        ({ team, status, pressured }) =>
          team === next.activeTeam && status === 'deployed' && pressured,
      )
      .map(({ id }) => id),
  );

  if (action.type === 'move' || action.type === 'deploy') {
    const piece = getPiece(next, action.pieceId)!;
    piece.hex = cloneHex(action.to);
    piece.status = 'deployed';
    piece.cooldownTurns = 0;
  } else if (action.type === 'stance') {
    getPiece(next, action.pieceId)!.stance = action.stance;
  }

  next.lastAction = cloneAction(action);
  next = recalculateGameState(next);
  next.pendingRetreatIds = [...dueToRetreat].filter((id) => getPiece(next, id)?.pressured);
  if (next.pendingRetreatIds.length > 0) {
    next.phase = 'retreat';
    return next;
  }
  return finishTurn(next, new Set());
}

function applyRetreatAction(state: GameState, action: RetreatAction): GameState {
  let next = cloneGameState(state);
  const newlyRouted = new Set<string>();
  for (const pieceId of next.pendingRetreatIds) {
    const piece = getPiece(next, pieceId)!;
    const destination = action.destinations[pieceId];
    if (destination) {
      piece.hex = cloneHex(destination);
      if (piece.type === 'anchor') piece.stance = 'packed';
    } else {
      piece.hex = null;
      piece.status = 'cooling';
      piece.cooldownTurns = 1;
      piece.stance = 'packed';
      newlyRouted.add(piece.id);
    }
  }
  next.lastAction = cloneAction(action);
  next.pendingRetreatIds = [];
  next.phase = 'action';
  next = recalculateGameState(next);
  return finishTurn(next, newlyRouted);
}

function finishTurn(state: GameState, newlyRouted: ReadonlySet<string>): GameState {
  const next = recalculateGameState(state);
  for (const piece of next.pieces) {
    if (
      piece.team === next.activeTeam &&
      piece.status === 'cooling' &&
      !newlyRouted.has(piece.id)
    ) {
      piece.cooldownTurns = Math.max(0, piece.cooldownTurns - 1);
      if (piece.cooldownTurns === 0) piece.status = 'reserve';
    }
  }

  const threshold = Math.ceil(next.board.length * DOMINANCE_PERCENTAGE);
  if (next.dominance) {
    if (next.territoryCounts[next.dominance.team] < threshold) {
      next.dominance = null;
    } else if (next.activeTeam !== next.dominance.team) {
      next.winner = next.dominance.team;
      next.phase = 'game-over';
      return next;
    }
  }
  if (!next.dominance && next.territoryCounts[next.activeTeam] >= threshold) {
    next.dominance = { team: next.activeTeam, startedOnTurn: next.turn };
  }

  if (next.turn >= MAX_TURNS) {
    const [violet, crimson] = next.territoryCounts;
    next.winner = violet === crimson ? 'draw' : violet > crimson ? 0 : 1;
    next.phase = 'game-over';
    return next;
  }

  next.activeTeam = otherTeam(next.activeTeam);
  next.turn += 1;
  next.phase = 'action';
  return next;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  if (!isActionLegal(state, action)) {
    throw new Error(`Illegal action: ${actionKey(action)}`);
  }
  return applyLegalAction(state, action);
}

export function applyLegalAction(state: GameState, action: GameAction): GameState {
  return action.type === 'retreat'
    ? applyRetreatAction(state, action)
    : applyNormalAction(state, action);
}

export function previewAction(state: GameState, action: GameAction): GameState {
  return applyAction(state, action);
}

export function territoryPercentage(state: GameState, team: Team): number {
  return state.territoryCounts[team] / state.board.length;
}

export function roundNumber(state: GameState): number {
  return Math.ceil(state.turn / 2);
}

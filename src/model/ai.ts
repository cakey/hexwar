import { actionKey, applyLegalAction, BOARD_COLUMNS, getLegalActions } from './game.js';
import type { GameAction, GameState, Team } from './game.js';

export interface AiOptions {
  depth?: number;
  maxCandidates?: number;
  seed?: number;
}

const DEFAULT_DEPTH = 2;
const DEFAULT_MAX_CANDIDATES = 14;
const WIN_SCORE = 100_000;

const otherTeam = (team: Team): Team => (team === 0 ? 1 : 0);

export function evaluateState(state: GameState, perspective: Team): number {
  if (state.winner !== null) {
    if (state.winner === 'draw') return 0;
    return state.winner === perspective ? WIN_SCORE : -WIN_SCORE;
  }

  const opponent = otherTeam(perspective);
  let score = (state.territoryCounts[perspective] - state.territoryCounts[opponent]) * 12;

  for (const piece of state.pieces) {
    const direction = piece.team === perspective ? 1 : -1;
    if (piece.status === 'deployed') {
      score += direction * 18;
      if (piece.pressured) score -= direction * 30;
      if (piece.hex) {
        const progress = piece.team === 0 ? piece.hex[0] : BOARD_COLUMNS - 1 - piece.hex[0];
        score += direction * progress * (piece.type === 'scout' ? 1.3 : 0.7);
      }
      if (piece.type === 'anchor' && piece.stance === 'deployed') score += direction * 8;
    } else if (piece.status === 'cooling') {
      score -= direction * 10;
    }
  }

  if (state.dominance) score += state.dominance.team === perspective ? 650 : -650;
  return score;
}

interface Candidate {
  action: GameAction;
  next: GameState;
  score: number;
}

function rankedCandidates(state: GameState, perspective: Team, maxCandidates: number): Candidate[] {
  const candidates = getLegalActions(state).map((action) => {
    const next = applyLegalAction(state, action);
    return { action, next, score: evaluateState(next, perspective) };
  });
  const maximizing = state.activeTeam === perspective;
  candidates.sort(
    (first, second) =>
      (maximizing ? second.score - first.score : first.score - second.score) ||
      actionKey(first.action).localeCompare(actionKey(second.action)),
  );
  return candidates.slice(0, Math.max(1, maxCandidates));
}

function search(
  state: GameState,
  perspective: Team,
  handoffsLeft: number,
  maxCandidates: number,
  alpha: number,
  beta: number,
): number {
  if (state.winner !== null || handoffsLeft <= 0) return evaluateState(state, perspective);
  const candidates = rankedCandidates(state, perspective, maxCandidates);
  if (candidates.length === 0) return evaluateState(state, perspective);

  const maximizing = state.activeTeam === perspective;
  let best = maximizing ? -Infinity : Infinity;
  for (const candidate of candidates) {
    const handoff = candidate.next.activeTeam !== state.activeTeam;
    const value = search(
      candidate.next,
      perspective,
      handoffsLeft - (handoff ? 1 : 0),
      maxCandidates,
      alpha,
      beta,
    );
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function seededIndex(seed: number, length: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return Math.abs(value) % length;
}

export function chooseAction(state: GameState, options: AiOptions = {}): GameAction | null {
  const legal = getLegalActions(state);
  if (legal.length === 0) return null;

  const perspective = state.activeTeam;
  const depth = Math.max(1, options.depth ?? DEFAULT_DEPTH);
  const maxCandidates = Math.max(1, options.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
  const scored = rankedCandidates(state, perspective, maxCandidates).map((candidate) => {
    const handoff = candidate.next.activeTeam !== state.activeTeam;
    return {
      action: candidate.action,
      score: search(
        candidate.next,
        perspective,
        depth - (handoff ? 1 : 0),
        maxCandidates,
        -Infinity,
        Infinity,
      ),
    };
  });
  const bestScore = Math.max(...scored.map(({ score }) => score));
  const best = scored.filter(({ score }) => score === bestScore);
  return best[seededIndex(options.seed ?? state.turn * 9973, best.length)].action;
}

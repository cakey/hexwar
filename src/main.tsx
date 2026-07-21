import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  cloneGameState,
  createInitialState,
  DOMINANCE_PERCENTAGE,
  roundNumber,
  TEAM_NAMES,
} from './model/game.js';
import type { GameAction, GameState, PieceState } from './model/game.js';
import { GameEngine } from './rendering/game-engine.js';
import type { GameView } from './rendering/game-engine.js';
import './styles.css';

const initialState = createInitialState();
const INITIAL_VIEW: GameView = {
  state: initialState,
  displayState: cloneGameState(initialState),
  selectedPieceId: null,
  plannedAction: null,
  legalDestinations: [],
  retreatingPieceId: null,
  mode: 'ai',
  aiThinking: false,
};

const pieceName = (piece: PieceState): string => {
  const number = piece.id.endsWith('-2') ? ' II' : '';
  return `${piece.type[0].toUpperCase()}${piece.type.slice(1)}${number}`;
};

function Score({ state, displayState }: { state: GameState; displayState: GameState }) {
  const projected = displayState.territoryCounts;
  const live = state.territoryCounts;
  const score = (team: 0 | 1) => {
    const delta = projected[team] - live[team];
    return (
      <span className={`score__team score__team--${team === 0 ? 'violet' : 'crimson'}`}>
        {projected[team]}
        {delta !== 0 && <small>{delta > 0 ? `+${delta}` : delta}</small>}
      </span>
    );
  };

  return (
    <section className="score" aria-label="Territory score">
      {score(0)}
      <span className="score__neutral" title="Neutral or contested tiles">
        {projected[2]}
      </span>
      {score(1)}
    </section>
  );
}

function actionLabel(action: GameAction | null, state: GameState): string {
  if (!action) return '';
  if (action.type === 'pass') return 'Pass this turn';
  if (action.type === 'retreat') {
    const routes = Object.values(action.destinations).filter((hex) => hex === null).length;
    return routes > 0 ? `Confirm retreats · ${routes} routed` : 'Confirm free retreats';
  }
  const piece = state.pieces.find(({ id }) => id === action.pieceId);
  const name = piece ? pieceName(piece) : 'Piece';
  if (action.type === 'stance') {
    return `${action.stance === 'deployed' ? 'Deploy' : 'Pack'} ${name}`;
  }
  return `${action.type === 'deploy' ? 'Place' : 'Move'} ${name} to ${action.to.join(', ')}`;
}

interface ControlPanelProps {
  view: GameView;
  engine: GameEngine | null;
}

function ControlPanel({ view, engine }: ControlPanelProps) {
  const { state, displayState, selectedPieceId, plannedAction } = view;
  const activePieces = state.pieces.filter(({ team }) => team === state.activeTeam);
  const selected = activePieces.find(({ id }) => id === selectedPieceId);
  const reserves = activePieces.filter(({ status }) => status !== 'deployed');
  const pressured = activePieces.filter(({ pressured }) => pressured).length;
  const territory = Math.round(
    (displayState.territoryCounts[state.activeTeam] / state.board.length) * 100,
  );
  const humanTurn = view.mode === 'hotseat' || state.activeTeam === 0;

  let hint = 'Choose a piece, reserve, or pass.';
  if (!humanTurn) hint = 'Crimson is weighing territory, pressure, and your reply.';
  else if (state.phase === 'retreat') hint = 'Plan a safe tile for each forced retreat.';
  else if (plannedAction) hint = 'Review the projected influence, then confirm.';
  else if (selected) hint = `Choose one of ${view.legalDestinations.length} legal destinations.`;

  return (
    <section className={`turn-panel turn-panel--team-${state.activeTeam}`}>
      <div className="turn-panel__heading">
        <div>
          <p className="turn-panel__eyebrow">Round {roundNumber(state)} · one action</p>
          <h2>{TEAM_NAMES[state.activeTeam]} moves</h2>
        </div>
        <span className="territory-percent">{territory}%</span>
      </div>

      {pressured > 0 && (
        <p className="pressure-alert">
          {pressured} piece{pressured === 1 ? '' : 's'} under pressure
        </p>
      )}

      <p className="turn-panel__hint">{hint}</p>

      {humanTurn && reserves.length > 0 && state.phase === 'action' && !plannedAction && (
        <div className="reserve-tray" aria-label="Reserve pieces">
          {reserves.map((piece) => (
            <button
              className={piece.id === selectedPieceId ? 'reserve reserve--selected' : 'reserve'}
              disabled={piece.status === 'cooling'}
              key={piece.id}
              onClick={() => engine?.selectReserve(piece.id)}
              type="button"
            >
              <span>{pieceName(piece)}</span>
              <small>{piece.status === 'cooling' ? 'Cooling' : 'Ready'}</small>
            </button>
          ))}
        </div>
      )}

      {humanTurn &&
        selected?.type === 'anchor' &&
        selected.status === 'deployed' &&
        !plannedAction && (
          <button
            className="secondary-action"
            onClick={() =>
              engine?.planStance(selected.id, selected.stance === 'packed' ? 'deployed' : 'packed')
            }
            type="button"
          >
            {selected.stance === 'packed' ? 'Deploy Anchor' : 'Pack Anchor'}
          </button>
        )}

      {plannedAction ? (
        <div className="confirmation">
          <p>{actionLabel(plannedAction, state)}</p>
          {humanTurn ? (
            <div className="confirmation__buttons">
              <button className="confirm" onClick={() => engine?.confirm()} type="button">
                Confirm
              </button>
              <button onClick={() => engine?.cancel()} type="button">
                Cancel
              </button>
            </div>
          ) : (
            <small>AI preview</small>
          )}
        </div>
      ) : (
        humanTurn &&
        state.phase === 'action' && (
          <button className="secondary-action" onClick={() => engine?.planPass()} type="button">
            Pass
          </button>
        )
      )}
    </section>
  );
}

function App() {
  const battlefieldRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [view, setView] = useState<GameView>(INITIAL_VIEW);
  const [renderError, setRenderError] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let active = true;
    let engine: GameEngine | undefined;
    try {
      engine = new GameEngine(battlefieldRef.current!, setView);
      setEngine(engine);
    } catch (error) {
      console.error('Unable to start the HexWar renderer.', error);
      queueMicrotask(() => {
        if (active) setRenderError(true);
      });
    }
    return () => {
      active = false;
      engine?.destroy();
    };
  }, []);

  const dominance = view.state.dominance;
  const winner = view.state.winner;

  return (
    <main className="app">
      <div className="battlefield" ref={battlefieldRef} />
      {renderError && (
        <div className="render-error" role="alert">
          <h2>3D rendering is unavailable</h2>
          <p>Enable WebGL or hardware acceleration in your browser, then reload.</p>
        </div>
      )}
      <header className="brand">
        <span className="brand__mark" aria-hidden="true">
          ⬡
        </span>
        <div>
          <h1>HexWar</h1>
          <p>Claim the field</p>
        </div>
      </header>
      <Score state={view.state} displayState={view.displayState} />
      {dominance && !winner && (
        <div className={`dominance dominance--team-${dominance.team}`}>
          {TEAM_NAMES[dominance.team]} holds {Math.round(DOMINANCE_PERCENTAGE * 100)}% · respond now
        </div>
      )}
      <ControlPanel view={view} engine={engine} />
      <div className="match-controls" aria-label="Match mode">
        <button aria-pressed={view.mode === 'ai'} onClick={() => engine?.reset('ai')} type="button">
          Vs AI
        </button>
        <button
          aria-pressed={view.mode === 'hotseat'}
          onClick={() => engine?.reset('hotseat')}
          type="button"
        >
          Hotseat
        </button>
        <button className="new-match" onClick={() => engine?.reset()} type="button">
          New match
        </button>
        <button onClick={() => setShowRules(true)} type="button">
          How to play
        </button>
      </div>
      <p className="instructions">Select · preview influence · confirm one action</p>

      {winner !== null && (
        <div className="match-result" role="dialog" aria-modal="true" aria-label="Match complete">
          <p>Match complete</p>
          <h2>{winner === 'draw' ? 'Territory locked' : `${TEAM_NAMES[winner]} dominates`}</h2>
          <button onClick={() => engine?.reset()} type="button">
            Play again
          </button>
        </div>
      )}

      {showRules && (
        <div className="rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
          <button
            aria-label="Close how to play"
            className="rules-sheet__close"
            onClick={() => setShowRules(false)}
            type="button"
          >
            ×
          </button>
          <p>Field manual</p>
          <h2 id="rules-title">Win through influence</h2>
          <ol>
            <li>Take one action, then review the projected territory and confirm.</li>
            <li>Scouts move 2; Standards spread wide influence; deployed Anchors hold ground.</li>
            <li>Relieve pressured pieces on your next action or retreat them for free.</li>
            <li>Hold at least 60% of the board through the opponent's reply to win.</li>
          </ol>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

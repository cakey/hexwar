import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  baseInfluenceAt,
  cloneGameState,
  createInitialState,
  DOMINANCE_PERCENTAGE,
  getTile,
  roundNumber,
  TEAM_NAMES,
} from './model/game.js';
import type { GameAction, GameState, PieceState, TileState } from './model/game.js';
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
  hoveredHex: null,
  keyboardStage: null,
  keyboardDestination: null,
};

function tileShare(tile: TileState | undefined, team: 0 | 1): number {
  if (!tile) return 0;
  const total = tile.influence[0] + tile.influence[1];
  return total === 0 ? 0 : Math.round((tile.influence[team] / total) * 100);
}

function TileIntel({ view }: { view: GameView }) {
  if (!view.hoveredHex) return null;
  const live = getTile(view.state, view.hoveredHex);
  const projected = getTile(view.displayState, view.hoveredHex);
  if (!live || !projected) return null;
  const violet = tileShare(projected, 0);
  const crimson = tileShare(projected, 1);
  const violetInfluenceDelta = projected.influence[0] - live.influence[0];
  const crimsonInfluenceDelta = projected.influence[1] - live.influence[1];
  const activeTeam = view.state.activeTeam;
  const opponent = activeTeam === 0 ? 1 : 0;
  const activeInfluence = projected.influence[activeTeam];
  const opposingInfluence = projected.influence[opponent];
  const captureNeed = Math.max(0, opposingInfluence - activeInfluence + 1);
  const captureSummary =
    projected.controller === activeTeam
      ? activeInfluence + opposingInfluence === 0
        ? `${TEAM_NAMES[activeTeam]} holds this tile without active influence.`
        : `${TEAM_NAMES[activeTeam]} leads by ${activeInfluence - opposingInfluence}.`
      : `${TEAM_NAMES[activeTeam]} needs ${captureNeed} more influence to capture.`;
  const owner =
    projected.influence[0] + projected.influence[1] === 0 && projected.controller !== null
      ? `${TEAM_NAMES[projected.controller]} held · no active pressure`
      : projected.controller === null
        ? 'Contested'
        : `${TEAM_NAMES[projected.controller]} controlled`;

  return (
    <aside className="tile-intel" aria-live="polite">
      <div>
        <strong>Hex {view.hoveredHex.join(', ')}</strong>
        <small>{owner}</small>
        <small>{captureSummary}</small>
      </div>
      <span className="tile-intel__violet">
        Violet {violet}% share
        <small>
          {projected.influence[0]} influence
          {baseInfluenceAt(view.hoveredHex, 0) > 0 &&
            ` · ${baseInfluenceAt(view.hoveredHex, 0)} from base`}
        </small>
        {violetInfluenceDelta !== 0 && (
          <b>
            {violetInfluenceDelta > 0 ? '+' : ''}
            {violetInfluenceDelta} influence
          </b>
        )}
      </span>
      <span className="tile-intel__crimson">
        Crimson {crimson}% share
        <small>
          {projected.influence[1]} influence
          {baseInfluenceAt(view.hoveredHex, 1) > 0 &&
            ` · ${baseInfluenceAt(view.hoveredHex, 1)} from base`}
        </small>
        {crimsonInfluenceDelta !== 0 && (
          <b>
            {crimsonInfluenceDelta > 0 ? '+' : ''}
            {crimsonInfluenceDelta} influence
          </b>
        )}
      </span>
    </aside>
  );
}

const pieceName = (piece: PieceState): string => {
  const number = piece.id.endsWith('-2') ? ' II' : '';
  return `${piece.type[0].toUpperCase()}${piece.type.slice(1)}${number}`;
};

const PIECE_DETAILS = {
  scout: {
    role: 'Rapid probe',
    movement: 'Move 2',
    influence: 'Influence 3 · 2 · 1',
    description: 'Reaches gaps quickly, but exerts only local pressure.',
  },
  standard: {
    role: 'Field standard',
    movement: 'Move 1',
    influence: 'Influence 4 · 3 · 2 · 1',
    description: 'Your broad, flexible source of territorial influence.',
  },
  anchor: {
    role: 'Mobile bulwark',
    movement: 'Move 1 packed · fixed deployed',
    influence: '3 · 2 · 1 packed / 5 · 4 · 3 · 2 · 1 deployed',
    description: 'Deploy to dominate a region; packing is free before your action.',
  },
} as const;

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
    return action.stance === 'deployed' ? `Deploy ${name}` : `Pack ${name} · free, turn continues`;
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
  const fieldPieces = activePieces.filter(({ status }) => status === 'deployed');
  const reserves = activePieces.filter(({ status }) => status !== 'deployed');
  const pressured = activePieces.filter(({ pressured }) => pressured).length;
  const territory = Math.round(
    (displayState.territoryCounts[state.activeTeam] / state.board.length) * 100,
  );
  const humanTurn = view.mode === 'hotseat' || state.activeTeam === 0;

  let hint = 'Choose a piece, reserve, or pass.';
  if (!humanTurn) hint = 'Crimson is weighing territory, pressure, and your reply.';
  else if (state.phase === 'retreat') hint = 'Plan a safe tile for each forced retreat.';
  else if (plannedAction) hint = 'Review the projected influence, then press Enter to confirm.';
  else if (view.keyboardStage === 'pieces' && selected)
    hint = `${pieceName(selected)} focused · press Enter to choose its destination.`;
  else if (view.keyboardStage === 'destinations')
    hint = 'Use the arrow keys to choose a hex, then press Enter to preview.';
  else if (selected) hint = `Choose one of ${view.legalDestinations.length} legal destinations.`;

  return (
    <section className={`turn-panel turn-panel--team-${state.activeTeam}`}>
      <div className="turn-panel__heading">
        <div>
          <p className="turn-panel__eyebrow">
            Round {roundNumber(state)} · one action · packing is free
          </p>
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

      <div className="influence-legend" aria-label="Influence strength">
        <span>Influence</span>
        <i data-strength="1" title="Reach" />
        <i data-strength="2" title="Weak" />
        <i data-strength="3" title="Firm" />
        <i data-strength="4" title="Strong" />
      </div>

      {selected && !plannedAction && (
        <article className={`selected-unit selected-unit--${selected.type}`}>
          <span className="selected-unit__glyph" aria-hidden="true" />
          <div>
            <small>{PIECE_DETAILS[selected.type].role}</small>
            <h3>{pieceName(selected)}</h3>
            <p>
              {PIECE_DETAILS[selected.type].movement} · {PIECE_DETAILS[selected.type].influence}
            </p>
            <p>{PIECE_DETAILS[selected.type].description}</p>
          </div>
        </article>
      )}

      {humanTurn && !selected && !plannedAction && state.phase === 'action' && (
        <div className="field-roster" aria-label="Pieces on the field">
          {fieldPieces.map((piece) => (
            <button key={piece.id} onClick={() => engine?.selectPiece(piece.id)} type="button">
              <i className={`unit-icon unit-icon--${piece.type}`} aria-hidden="true" />
              <span>{pieceName(piece)}</span>
              <small>{PIECE_DETAILS[piece.type].role}</small>
            </button>
          ))}
        </div>
      )}

      {humanTurn &&
        !selected &&
        reserves.length > 0 &&
        state.phase === 'action' &&
        !plannedAction && (
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
            {selected.stance === 'packed' ? 'Deploy Anchor' : 'Pack Anchor · Free'}
          </button>
        )}

      {plannedAction ? (
        <div className="confirmation">
          <p>{actionLabel(plannedAction, state)}</p>
          {humanTurn ? (
            <div className="confirmation__buttons">
              <button className="confirm" onClick={() => engine?.confirm()} type="button">
                Confirm <kbd>Enter</kbd>
              </button>
              <button onClick={() => engine?.cancel()} type="button">
                Cancel <kbd>Esc</kbd>
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
      <TileIntel view={view} />
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
      <p className="instructions">Arrow keys select · Enter advances · Esc goes back · drag pans</p>

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
            <li>Take one action; packing a deployed Anchor first is free.</li>
            <li>Scouts move 2; Standards spread wide influence; deployed Anchors hold ground.</li>
            <li>Relieve pressured pieces on your next action or retreat them for free.</li>
            <li>Hold at least 60% of the board through the opponent's reply to win.</li>
            <li>Use arrows to choose pieces and hexes; Enter advances and Escape steps back.</li>
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

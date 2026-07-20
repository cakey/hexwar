import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameEngine } from './game.js';
import './styles.css';

const INITIAL_STATE = {
  currentTeamTurn: 0,
  teamName: 'Violet',
  turn: 1,
  movesRemaining: 4,
  totalInfluence: [0, 0, 0],
  hasSelection: false,
};

function Score({ scores }) {
  return (
    <section className="score" aria-label="Territory score">
      <span className="score__team score__team--violet">{scores[0]}</span>
      <span className="score__neutral" title="Neutral tiles">{scores[2]}</span>
      <span className="score__team score__team--crimson">{scores[1]}</span>
    </section>
  );
}

function TurnPanel({ game, onReset }) {
  const moveMarkers = Array.from({ length: 4 }, (_, index) => (
    <span
      className={index < game.movesRemaining ? 'move move--ready' : 'move'}
      key={index}
    />
  ));

  return (
    <section className={`turn-panel turn-panel--team-${game.currentTeamTurn}`}>
      <p className="turn-panel__eyebrow">Turn {game.turn}</p>
      <h2>{game.teamName} moves</h2>
      <div className="moves" aria-label={`${game.movesRemaining} moves remaining`}>
        {moveMarkers}
      </div>
      <p className="turn-panel__hint">
        {game.hasSelection
          ? 'Choose a highlighted tile to move.'
          : 'Choose one of your pieces.'}
      </p>
      <button type="button" onClick={onReset}>New match</button>
    </section>
  );
}

function App() {
  const battlefieldRef = useRef(null);
  const engineRef = useRef(null);
  const [game, setGame] = useState(INITIAL_STATE);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let active = true;
    let engine;
    try {
      engine = new GameEngine(battlefieldRef.current, setGame);
      engineRef.current = engine;
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
        <span className="brand__mark" aria-hidden="true">⬡</span>
        <div>
          <h1>HexWar</h1>
          <p>Claim the field</p>
        </div>
      </header>
      <Score scores={game.totalInfluence} />
      <TurnPanel game={game} onReset={() => engineRef.current?.reset()} />
      <p className="instructions">Select a piece, then choose a tile · Four moves per turn</p>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

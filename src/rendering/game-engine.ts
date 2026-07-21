import * as THREE from 'three';
import { chooseAction } from '../model/ai.js';
import {
  actionKey,
  applyAction,
  cloneAction,
  cloneGameState,
  createInitialState,
  getLegalActions,
  getPiece,
  previewAction,
} from '../model/game.js';
import { hexKey } from '../model/hex.js';
import type {
  AnchorStance,
  GameAction,
  GameState,
  PieceState,
  RetreatAction,
  TileState,
} from '../model/game.js';
import type { Hex } from '../model/hex.js';

type TileHighlight = 'none' | 'available' | 'hovered';

export interface GameView {
  state: GameState;
  displayState: GameState;
  selectedPieceId: string | null;
  plannedAction: GameAction | null;
  legalDestinations: Hex[];
  retreatingPieceId: string | null;
  mode: MatchMode;
  aiThinking: boolean;
}

export type MatchMode = 'ai' | 'hotseat';

export const COLORS = {
  violet: 0x9b5de5,
  violetDark: 0x6337a3,
  crimson: 0xff4d6d,
  crimsonDark: 0xa4133c,
  selected: 0xf8fafc,
  neutral: 0x243248,
  contested: 0x526175,
  highlight: 0xffbe0b,
  available: 0x35d07f,
  pressure: 0xffbe0b,
};

const HALF_EDGE = 40;
const TILE_HEIGHT = 8;

const sameHex = (first: Hex | null, second: Hex | null): boolean =>
  first === null || second === null
    ? first === second
    : first[0] === second[0] && first[1] === second[1];

function makeHexGeometry(): THREE.ExtrudeGeometry {
  const stalk = HALF_EDGE * Math.tan(Math.PI / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-HALF_EDGE, -stalk);
  shape.lineTo(HALF_EDGE, -stalk);
  shape.lineTo(HALF_EDGE * 2, 0);
  shape.lineTo(HALF_EDGE, stalk);
  shape.lineTo(-HALF_EDGE, stalk);
  shape.lineTo(-HALF_EDGE * 2, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: TILE_HEIGHT,
    bevelEnabled: true,
    bevelSize: 1.5,
    bevelThickness: 1.5,
    bevelSegments: 2,
  });
  geometry.computeVertexNormals();
  return geometry;
}

function hexToWorld([column, row]: Hex): { x: number; y: number } {
  const border = 12;
  const edge = HALF_EDGE * 2;
  const extra = column % 2;
  const percentOffset = extra < 1 ? extra : 2 - extra;
  return {
    x: (edge * 1.5 + border * (2 / 3)) * column,
    y: (edge * Math.sqrt(3) + border) * (row + percentOffset * 0.5),
  };
}

class Tile {
  readonly hex: Hex;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  private state: TileState;
  private highlight: TileHighlight = 'none';

  constructor(hex: Hex, geometry: THREE.ExtrudeGeometry) {
    this.hex = hex;
    this.state = { hex, influence: [0, 0], controller: null };
    this.material = new THREE.MeshStandardMaterial({
      color: COLORS.neutral,
      roughness: 0.72,
      metalness: 0.04,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    const { x, y } = hexToWorld(hex);
    this.mesh.position.set(x, y, 0);
    this.mesh.userData.tile = this;
  }

  setState(state: TileState): void {
    this.state = state;
    this.updateColor();
  }

  setHighlight(highlight: TileHighlight): void {
    if (highlight === this.highlight) return;
    this.highlight = highlight;
    this.updateColor();
  }

  private updateColor(): void {
    if (this.highlight === 'hovered') {
      this.material.color.setHex(COLORS.highlight);
      return;
    }
    if (this.highlight === 'available') {
      this.material.color.setHex(COLORS.available);
      return;
    }
    if (this.state.controller === 0) this.material.color.setHex(COLORS.violet);
    else if (this.state.controller === 1) this.material.color.setHex(COLORS.crimson);
    else if (this.state.influence[0] + this.state.influence[1] > 0) {
      this.material.color.setHex(COLORS.contested);
    } else this.material.color.setHex(COLORS.neutral);
  }
}

class TileManager {
  readonly group = new THREE.Group();
  readonly tiles = new Map<string, Tile>();

  constructor(scene: THREE.Scene, boardHexes: Hex[]) {
    this.group.name = 'battlefield';
    const geometry = makeHexGeometry();
    for (const hex of boardHexes) {
      const tile = new Tile(hex, geometry);
      this.tiles.set(hexKey(hex), tile);
      this.group.add(tile.mesh);
    }
    scene.add(this.group);
  }

  intersect(raycaster: THREE.Raycaster): Hex | undefined {
    const intersection = raycaster.intersectObjects(this.group.children, false)[0];
    return (intersection?.object.userData.tile as Tile | undefined)?.hex;
  }

  applyTiles(tiles: TileState[]): void {
    for (const tile of tiles) this.tiles.get(hexKey(tile.hex))?.setState(tile);
  }

  setHighlights(available: Hex[], hovered?: Hex): void {
    const availableKeys = new Set(available.map(hexKey));
    for (const tile of this.tiles.values()) {
      const isHovered =
        hovered && sameHex(tile.hex, hovered) && availableKeys.has(hexKey(tile.hex));
      tile.setHighlight(
        isHovered ? 'hovered' : availableKeys.has(hexKey(tile.hex)) ? 'available' : 'none',
      );
    }
  }

  dispose(scene: THREE.Scene): void {
    const firstTile = this.tiles.values().next().value as Tile | undefined;
    for (const tile of this.tiles.values()) tile.material.dispose();
    firstTile?.mesh.geometry.dispose();
    scene.remove(this.group);
  }
}

function geometryFor(piece: PieceState): THREE.BufferGeometry {
  if (piece.type === 'scout') return new THREE.ConeGeometry(21, 62, 6);
  if (piece.type === 'anchor') return new THREE.CylinderGeometry(29, 34, 52, 6);
  return new THREE.CylinderGeometry(10, 28, 76, 6);
}

class PlayerPiece {
  readonly id: string;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private segments: Array<{ from: Hex; to: Hex }> = [];
  private segmentProgress = 0;
  private baseHeight = TILE_HEIGHT + 38;

  constructor(scene: THREE.Scene, piece: PieceState) {
    this.id = piece.id;
    this.material = new THREE.MeshStandardMaterial({
      color: piece.team === 0 ? COLORS.violetDark : COLORS.crimsonDark,
      roughness: 0.45,
      metalness: 0.12,
    });
    this.mesh = new THREE.Mesh(geometryFor(piece), this.material);
    this.mesh.rotation.x = Math.PI / 2;
    scene.add(this.mesh);
    this.sync(piece, false, false);
  }

  sync(piece: PieceState, selected: boolean, previewed: boolean): void {
    this.mesh.visible = piece.status === 'deployed' && piece.hex !== null;
    if (!this.mesh.visible || !piece.hex) return;
    if (!this.isMoving) this.setWorldPosition(piece.hex);
    this.baseHeight = TILE_HEIGHT + (piece.type === 'anchor' ? 26 : 38);
    this.mesh.position.z = this.baseHeight;
    const anchorScale = piece.type === 'anchor' && piece.stance === 'deployed' ? 1.35 : 1;
    this.mesh.scale.set(anchorScale, anchorScale, anchorScale);
    this.material.transparent = previewed;
    this.material.opacity = previewed ? 0.62 : 1;
    this.material.emissive.setHex(
      piece.pressured ? COLORS.pressure : selected ? COLORS.selected : 0x000000,
    );
    this.material.emissiveIntensity = piece.pressured ? 0.5 : selected ? 0.55 : 0;
  }

  animate(from: Hex, to: Hex): void {
    this.setWorldPosition(from);
    this.segments = [{ from, to }];
    this.segmentProgress = 0;
  }

  get isMoving(): boolean {
    return this.segments.length > 0;
  }

  update(deltaSeconds: number): void {
    if (!this.mesh.visible || this.segments.length === 0) return;
    this.segmentProgress += deltaSeconds / 0.2;
    const segment = this.segments[0];
    const start = hexToWorld(segment.from);
    const end = hexToWorld(segment.to);
    const progress = Math.min(this.segmentProgress, 1);
    this.mesh.position.x = THREE.MathUtils.lerp(start.x, end.x, progress);
    this.mesh.position.y = THREE.MathUtils.lerp(start.y, end.y, progress);
    this.mesh.position.z = this.baseHeight + Math.sin(progress * Math.PI) * 20;
    if (this.segmentProgress >= 1) {
      this.setWorldPosition(segment.to);
      this.mesh.position.z = this.baseHeight;
      this.segments.shift();
      this.segmentProgress = 0;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private setWorldPosition(hex: Hex): void {
    const { x, y } = hexToWorld(hex);
    this.mesh.position.x = x;
    this.mesh.position.y = y;
  }
}

export class GameEngine {
  private readonly container: HTMLElement;
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly raycaster = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly tileManager: TileManager;
  private readonly pieces = new Map<string, PlayerPiece>();
  private readonly onViewChange: (view: GameView) => void;
  private state = createInitialState();
  private selectedPieceId: string | null = null;
  private plannedAction: GameAction | null = null;
  private previewState: GameState | null = null;
  private retreatChoices: Record<string, Hex | null> = {};
  private hoveredHex?: Hex;
  private mode: MatchMode = 'ai';
  private aiThinking = false;
  private readonly aiTimers = new Set<number>();
  private readonly handleResize: () => void;
  private readonly handlePointerMove: (event: PointerEvent) => void;
  private readonly handlePointerLeave: () => void;
  private readonly handlePointerDown: (event: PointerEvent) => void;

  constructor(container: HTMLElement, onViewChange: (view: GameView) => void) {
    this.container = container;
    this.onViewChange = onViewChange;
    this.timer.connect(document);
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 1650, 2600);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive HexWar battlefield');
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xc7dcff, 0x172036, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(500, -400, 900);
    this.scene.add(keyLight);

    this.tileManager = new TileManager(this.scene, this.state.board);
    this.syncScene();
    this.handleResize = this.resize.bind(this);
    this.handlePointerMove = this.pointerMove.bind(this);
    this.handlePointerLeave = () => {
      this.pointer.set(2, 2);
      this.hoveredHex = undefined;
    };
    this.handlePointerDown = this.pointerDown.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.resize();
    this.renderer.setAnimationLoop(() => this.render());
    this.publish();
  }

  reset(mode: MatchMode = this.mode): void {
    this.clearAiTimers();
    this.mode = mode;
    this.aiThinking = false;
    this.state = createInitialState();
    this.clearPlanning();
    this.syncScene();
    this.publish();
  }

  selectReserve(pieceId: string): void {
    if (!this.canHumanAct() || this.plannedAction || this.state.phase !== 'action') return;
    const piece = getPiece(this.state, pieceId);
    if (piece?.team !== this.state.activeTeam || piece.status !== 'reserve') return;
    this.selectedPieceId = pieceId;
    this.syncScene();
    this.publish();
  }

  planStance(pieceId: string, stance: AnchorStance): void {
    if (!this.canHumanAct()) return;
    const action = getLegalActions(this.state).find(
      (candidate) =>
        candidate.type === 'stance' && candidate.pieceId === pieceId && candidate.stance === stance,
    );
    if (action) this.plan(action);
  }

  planPass(): void {
    if (!this.canHumanAct()) return;
    const action = getLegalActions(this.state).find(({ type }) => type === 'pass');
    if (action) this.plan(action);
  }

  confirm(automated = false): void {
    if ((!automated && !this.canHumanAct()) || !this.plannedAction || this.anyPieceMoving()) return;
    const action = cloneAction(this.plannedAction);
    const previous = this.state;
    this.state = applyAction(this.state, action);
    this.clearPlanning();
    this.syncScene();
    this.animateAction(previous, action);
    if (this.state.phase === 'retreat') this.advanceForcedRoutes();
    this.publish();
    this.scheduleAiIfNeeded();
  }

  cancel(): void {
    if (!this.canHumanAct()) return;
    if (this.state.phase === 'retreat') this.retreatChoices = {};
    this.plannedAction = null;
    this.previewState = null;
    this.selectedPieceId = null;
    if (this.state.phase === 'retreat') this.advanceForcedRoutes();
    this.syncScene();
    this.publish();
  }

  destroy(): void {
    this.clearAiTimers();
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    for (const piece of this.pieces.values()) piece.dispose(this.scene);
    this.pieces.clear();
    this.tileManager.dispose(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const center = new THREE.Vector3(768, 450, 0);
    const horizontalDistance = 1020 / Math.max(this.camera.aspect, 0.55);
    const distanceFromBoard = Math.max(1250, horizontalDistance);
    this.camera.position.set(
      center.x,
      center.y - distanceFromBoard * 0.82,
      distanceFromBoard * 0.78,
    );
    this.camera.lookAt(center);
  }

  private updatePointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private pointerMove(event: PointerEvent): void {
    this.updatePointer(event);
    this.hoveredHex = this.intersectedHex();
  }

  private pointerDown(event: PointerEvent): void {
    if (
      !this.canHumanAct() ||
      this.anyPieceMoving() ||
      this.plannedAction ||
      this.state.phase === 'game-over'
    )
      return;
    this.updatePointer(event);
    const clickedHex = this.intersectedHex();
    if (!clickedHex) {
      this.selectedPieceId = null;
      this.publish();
      return;
    }

    if (this.state.phase === 'retreat') {
      this.chooseRetreat(clickedHex);
      return;
    }

    const destinationAction = this.destinationActions().find(
      (action) =>
        (action.type === 'move' || action.type === 'deploy') && sameHex(action.to, clickedHex),
    );
    if (destinationAction) {
      this.plan(destinationAction);
      return;
    }

    const piece = this.state.pieces.find(
      (candidate) =>
        candidate.status === 'deployed' &&
        candidate.hex &&
        sameHex(candidate.hex, clickedHex) &&
        candidate.team === this.state.activeTeam,
    );
    this.selectedPieceId = piece?.id ?? null;
    this.syncScene();
    this.publish();
  }

  private intersectedHex(): Hex | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.tileManager.intersect(this.raycaster);
  }

  private plan(action: GameAction): void {
    this.plannedAction = cloneAction(action);
    this.previewState = previewAction(this.state, action);
    this.syncScene();
    this.publish();
  }

  private destinationActions(): GameAction[] {
    if (!this.selectedPieceId) return [];
    return getLegalActions(this.state).filter(
      (action) =>
        (action.type === 'move' || action.type === 'deploy') &&
        action.pieceId === this.selectedPieceId,
    );
  }

  private matchingRetreatActions(): RetreatAction[] {
    return getLegalActions(this.state).filter((action): action is RetreatAction => {
      if (action.type !== 'retreat') return false;
      return Object.entries(this.retreatChoices).every(([id, destination]) =>
        sameHex(action.destinations[id], destination),
      );
    });
  }

  private advanceForcedRoutes(): void {
    for (const pieceId of this.state.pendingRetreatIds) {
      if (pieceId in this.retreatChoices) continue;
      const actions = this.matchingRetreatActions();
      if (actions.length > 0 && actions.every((action) => action.destinations[pieceId] === null)) {
        this.retreatChoices[pieceId] = null;
        continue;
      }
      this.selectedPieceId = pieceId;
      this.syncScene();
      return;
    }
    const exact = this.matchingRetreatActions()[0];
    if (exact) this.plan(exact);
  }

  private chooseRetreat(hex: Hex): void {
    if (!this.selectedPieceId) return;
    const matching = this.matchingRetreatActions().find((action) =>
      sameHex(action.destinations[this.selectedPieceId!], hex),
    );
    if (!matching) return;
    this.retreatChoices[this.selectedPieceId] = cloneHex(hex);
    this.advanceForcedRoutes();
    this.publish();
  }

  private retreatDestinations(): Hex[] {
    if (this.state.phase !== 'retreat' || !this.selectedPieceId) return [];
    const destinations = this.matchingRetreatActions()
      .map((action) => action.destinations[this.selectedPieceId!])
      .filter((hex): hex is Hex => hex !== null);
    return [...new Map(destinations.map((hex) => [hexKey(hex), hex])).values()];
  }

  private clearPlanning(): void {
    this.selectedPieceId = null;
    this.plannedAction = null;
    this.previewState = null;
    this.retreatChoices = {};
  }

  private syncScene(): void {
    const display = this.previewState ?? this.state;
    const previewIds = new Set<string>();
    if (this.plannedAction?.type === 'move' || this.plannedAction?.type === 'deploy') {
      previewIds.add(this.plannedAction.pieceId);
    } else if (this.plannedAction?.type === 'stance') {
      previewIds.add(this.plannedAction.pieceId);
    } else if (this.plannedAction?.type === 'retreat') {
      Object.keys(this.plannedAction.destinations).forEach((id) => previewIds.add(id));
    }

    for (const piece of display.pieces) {
      let rendered = this.pieces.get(piece.id);
      if (!rendered) {
        rendered = new PlayerPiece(this.scene, piece);
        this.pieces.set(piece.id, rendered);
      }
      rendered.sync(piece, piece.id === this.selectedPieceId, previewIds.has(piece.id));
    }
    this.tileManager.applyTiles(display.tiles);
  }

  private animateAction(previous: GameState, action: GameAction): void {
    if (action.type === 'move') {
      const from = getPiece(previous, action.pieceId)?.hex;
      if (from) this.pieces.get(action.pieceId)?.animate(from, action.to);
    } else if (action.type === 'retreat') {
      for (const [pieceId, destination] of Object.entries(action.destinations)) {
        const from = getPiece(previous, pieceId)?.hex;
        if (from && destination) this.pieces.get(pieceId)?.animate(from, destination);
      }
    }
  }

  private anyPieceMoving(): boolean {
    return [...this.pieces.values()].some(({ isMoving }) => isMoving);
  }

  private legalDestinations(): Hex[] {
    if (this.state.phase === 'retreat') return this.retreatDestinations();
    return this.destinationActions()
      .filter((action): action is Extract<GameAction, { type: 'move' | 'deploy' }> =>
        ['move', 'deploy'].includes(action.type),
      )
      .map(({ to }) => to);
  }

  private publish(): void {
    this.onViewChange({
      state: cloneGameState(this.state),
      displayState: cloneGameState(this.previewState ?? this.state),
      selectedPieceId: this.selectedPieceId,
      plannedAction: this.plannedAction ? cloneAction(this.plannedAction) : null,
      legalDestinations: this.legalDestinations().map(cloneHex),
      retreatingPieceId: this.state.phase === 'retreat' ? this.selectedPieceId : null,
      mode: this.mode,
      aiThinking: this.aiThinking,
    });
  }

  private canHumanAct(): boolean {
    return this.mode === 'hotseat' || (this.state.activeTeam === 0 && !this.aiThinking);
  }

  private clearAiTimers(): void {
    for (const timer of this.aiTimers) window.clearTimeout(timer);
    this.aiTimers.clear();
  }

  private scheduleAiIfNeeded(): void {
    if (this.mode !== 'ai' || this.state.activeTeam !== 1 || this.state.winner !== null) {
      this.aiThinking = false;
      this.publish();
      return;
    }
    this.aiThinking = true;
    this.publish();
    const planningTimer = window.setTimeout(() => {
      this.aiTimers.delete(planningTimer);
      const action = chooseAction(this.state, { depth: 2, seed: this.state.turn * 7919 });
      if (!action) {
        this.aiThinking = false;
        this.publish();
        return;
      }
      this.plan(action);
      const confirmationTimer = window.setTimeout(() => {
        this.aiTimers.delete(confirmationTimer);
        if (this.anyPieceMoving()) {
          this.scheduleAiIfNeeded();
          return;
        }
        this.confirm(true);
      }, 650);
      this.aiTimers.add(confirmationTimer);
    }, 350);
    this.aiTimers.add(planningTimer);
  }

  private render(): void {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    for (const piece of this.pieces.values()) piece.update(delta);
    const destinations = this.legalDestinations();
    this.tileManager.setHighlights(destinations, this.hoveredHex);
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.rendered = 'true';
    this.renderer.domElement.dataset.turn = String(this.state.turn);
    this.renderer.domElement.dataset.phase = this.state.phase;
    if (this.plannedAction)
      this.renderer.domElement.dataset.plannedAction = actionKey(this.plannedAction);
    else delete this.renderer.domElement.dataset.plannedAction;
  }
}

const cloneHex = ([column, row]: Hex): Hex => [column, row];

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
import { distance, hexKey } from '../model/hex.js';
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
  hoveredHex: Hex | null;
  keyboardStage: 'pieces' | 'destinations' | null;
  keyboardDestination: Hex | null;
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

function boardMetrics(board: Hex[]): { center: THREE.Vector3; width: number; height: number } {
  const points = board.map(hexToWorld);
  const minimumX = Math.min(...points.map(({ x }) => x)) - HALF_EDGE * 2;
  const maximumX = Math.max(...points.map(({ x }) => x)) + HALF_EDGE * 2;
  const minimumY = Math.min(...points.map(({ y }) => y)) - HALF_EDGE * 2;
  const maximumY = Math.max(...points.map(({ y }) => y)) + HALF_EDGE * 2;
  return {
    center: new THREE.Vector3((minimumX + maximumX) / 2, (minimumY + maximumY) / 2, 0),
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}

class Tile {
  readonly hex: Hex;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  private state: TileState;
  private highlight: TileHighlight = 'none';
  private readonly deltaMaterial = new THREE.SpriteMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  private readonly deltaSprite = new THREE.Sprite(this.deltaMaterial);
  private deltaText = '';

  constructor(hex: Hex, geometry: THREE.ExtrudeGeometry) {
    this.hex = hex;
    this.state = { hex, influence: [0, 0], controller: null };
    this.material = new THREE.MeshStandardMaterial({
      color: COLORS.neutral,
      roughness: 0.72,
      metalness: 0.04,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    const { x, y } = hexToWorld(hex);
    this.mesh.position.set(x, y, 0);
    this.mesh.userData.tile = this;
    this.deltaSprite.position.set(0, 0, 48);
    this.deltaSprite.scale.set(108, 40, 1);
    this.deltaSprite.renderOrder = 4;
    this.deltaSprite.visible = false;
    this.mesh.add(this.deltaSprite);
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

  setInfluenceDelta(text: string | null, team: 0 | 1): void {
    if (text === null) {
      this.deltaSprite.visible = false;
      this.deltaText = '';
      return;
    }
    this.deltaSprite.visible = true;
    if (text === this.deltaText) return;
    this.deltaText = text;
    this.deltaMaterial.map?.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = team === 0 ? 'rgba(109, 61, 179, .96)' : 'rgba(190, 42, 76, .96)';
    context.beginPath();
    context.roundRect(5, 5, 246, 86, 30);
    context.fill();
    context.strokeStyle = team === 0 ? '#c99cff' : '#ff9aae';
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '700 48px DM Sans, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.deltaMaterial.map = texture;
    this.deltaMaterial.needsUpdate = true;
  }

  dispose(): void {
    this.material.dispose();
    this.deltaMaterial.map?.dispose();
    this.deltaMaterial.dispose();
  }

  private updateColor(): void {
    this.material.emissive.setHex(0x000000);
    this.material.emissiveIntensity = 0;
    if (this.highlight === 'hovered') {
      this.material.color.setHex(COLORS.highlight);
      this.material.emissive.setHex(0x9a6400);
      this.material.emissiveIntensity = 0.45;
      return;
    }
    if (this.highlight === 'available') {
      this.material.color.setHex(COLORS.available);
      this.material.emissive.setHex(0x0b6b3e);
      this.material.emissiveIntensity = 0.24;
      return;
    }
    if (this.state.controller !== null) {
      const winning = this.state.influence[this.state.controller];
      const losing = this.state.influence[this.state.controller === 0 ? 1 : 0];
      const margin = winning - losing;
      const strength = margin >= 5 ? 0.95 : margin >= 3 ? 0.76 : margin >= 2 ? 0.57 : 0.38;
      const teamColor = new THREE.Color(
        this.state.controller === 0 ? COLORS.violet : COLORS.crimson,
      );
      this.material.color.setHex(COLORS.neutral).lerp(teamColor, strength);
      this.material.emissive.copy(teamColor);
      this.material.emissiveIntensity = 0.035 + strength * 0.035;
    } else if (this.state.influence[0] + this.state.influence[1] > 0) {
      this.material.color.setHex(COLORS.contested);
    } else this.material.color.setHex(COLORS.neutral);
  }
}

class TileManager {
  readonly group = new THREE.Group();
  readonly tiles = new Map<string, Tile>();
  private readonly environmentGeometries: THREE.BufferGeometry[] = [];
  private readonly environmentMaterials: THREE.Material[] = [];

  constructor(scene: THREE.Scene, boardHexes: Hex[]) {
    this.group.name = 'battlefield';
    const metrics = boardMetrics(boardHexes);
    this.addBattlefieldFoundation(metrics);
    const geometry = makeHexGeometry();
    for (const hex of boardHexes) {
      const tile = new Tile(hex, geometry);
      this.tiles.set(hexKey(hex), tile);
      this.group.add(tile.mesh);
    }
    scene.add(this.group);
  }

  private addBattlefieldFoundation(metrics: {
    center: THREE.Vector3;
    width: number;
    height: number;
  }): void {
    const addMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: THREE.Vector3,
    ): THREE.Mesh => {
      this.environmentGeometries.push(geometry);
      this.environmentMaterials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    const plinthMaterial = new THREE.MeshStandardMaterial({
      color: 0x10192a,
      roughness: 0.62,
      metalness: 0.35,
    });
    addMesh(
      new THREE.BoxGeometry(metrics.width + 150, metrics.height + 150, 22),
      plinthMaterial,
      new THREE.Vector3(metrics.center.x, metrics.center.y, -19),
    );
    const insetMaterial = new THREE.MeshStandardMaterial({
      color: 0x18243a,
      roughness: 0.74,
      metalness: 0.18,
    });
    addMesh(
      new THREE.BoxGeometry(metrics.width + 70, metrics.height + 70, 8),
      insetMaterial,
      new THREE.Vector3(metrics.center.x, metrics.center.y, -7),
    );

    for (const team of [0, 1] as const) {
      const color = team === 0 ? COLORS.violet : COLORS.crimson;
      const edgeX = metrics.center.x + (team === 0 ? -1 : 1) * (metrics.width / 2 + 45);
      const railMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.38,
        roughness: 0.38,
        metalness: 0.5,
      });
      addMesh(
        new THREE.BoxGeometry(16, metrics.height - 20, 18),
        railMaterial,
        new THREE.Vector3(edgeX, metrics.center.y, -1),
      );
      for (const offset of [-0.36, 0, 0.36]) {
        const beaconGeometry = new THREE.CylinderGeometry(13, 18, 42, 6);
        beaconGeometry.rotateX(Math.PI / 2);
        addMesh(
          beaconGeometry,
          railMaterial,
          new THREE.Vector3(edgeX, metrics.center.y + metrics.height * offset, 18),
        );
      }
    }
  }

  intersect(raycaster: THREE.Raycaster): Hex | undefined {
    const meshes = [...this.tiles.values()].map(({ mesh }) => mesh);
    const intersection = raycaster.intersectObjects(meshes, false)[0];
    return (intersection?.object.userData.tile as Tile | undefined)?.hex;
  }

  applyTiles(tiles: TileState[], liveTiles?: TileState[], previewTeam?: 0 | 1): void {
    const liveByHex = new Map(liveTiles?.map((tile) => [hexKey(tile.hex), tile]));
    for (const state of tiles) {
      const tile = this.tiles.get(hexKey(state.hex));
      tile?.setState(state);
      const live = liveByHex.get(hexKey(state.hex));
      const changed =
        live &&
        (live.influence[0] !== state.influence[0] || live.influence[1] !== state.influence[1]);
      let label: string | null = null;
      if (changed && previewTeam !== undefined) {
        const pointDelta = state.influence[previewTeam] - live.influence[previewTeam];
        label = pointDelta === 0 ? null : `${pointDelta > 0 ? '+' : ''}${pointDelta}`;
      }
      tile?.setInfluenceDelta(label, previewTeam ?? 0);
    }
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
    for (const tile of this.tiles.values()) tile.dispose();
    firstTile?.mesh.geometry.dispose();
    for (const geometry of this.environmentGeometries) geometry.dispose();
    for (const material of this.environmentMaterials) material.dispose();
    scene.remove(this.group);
  }
}

interface PieceModel {
  root: THREE.Group;
  body: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  geometries: THREE.BufferGeometry[];
  statusRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  deployedRings: THREE.Group;
}

function upright<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function createPieceModel(piece: PieceState): PieceModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.z = piece.team === 0 ? 0 : Math.PI;
  root.add(body);
  const teamColor = piece.team === 0 ? COLORS.violet : COLORS.crimson;
  const teamDark = piece.team === 0 ? COLORS.violetDark : COLORS.crimsonDark;
  const primary = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.34,
    metalness: 0.32,
    side: THREE.DoubleSide,
  });
  const secondary = new THREE.MeshStandardMaterial({
    color: teamDark,
    roughness: 0.48,
    metalness: 0.42,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xd7e2ef,
    roughness: 0.28,
    metalness: 0.76,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: teamColor,
    emissive: teamColor,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.18,
  });
  const materials = [primary, secondary, metal, glow];
  const geometries: THREE.BufferGeometry[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    position: [number, number, number],
    rotationZ = 0,
  ): THREE.Mesh => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.z = rotationZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  add(upright(new THREE.CylinderGeometry(24, 27, 9, 8)), secondary, [0, 0, 5]);
  add(new THREE.TorusGeometry(20, 2.5, 6, 24), metal, [0, 0, 10]);

  if (piece.type === 'scout') {
    add(upright(new THREE.ConeGeometry(13, 38, 6)), primary, [0, 0, 29]);
    add(upright(new THREE.OctahedronGeometry(10, 0)), glow, [0, 0, 53]);
    for (const direction of [-1, 1]) {
      const fin = add(new THREE.BoxGeometry(22, 5, 4), secondary, [direction * 12, -2, 25]);
      fin.rotation.y = direction * 0.42;
      fin.rotation.z = direction * -0.34;
    }
    add(new THREE.BoxGeometry(5, 28, 5), metal, [0, -10, 24]);
  } else if (piece.type === 'standard') {
    add(upright(new THREE.CylinderGeometry(4, 5, 63, 8)), metal, [0, 0, 39]);
    add(upright(new THREE.SphereGeometry(7, 8, 6)), glow, [0, 0, 73]);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    flagShape.lineTo(37, 0);
    flagShape.lineTo(29, 13);
    flagShape.lineTo(37, 26);
    flagShape.lineTo(0, 26);
    flagShape.closePath();
    add(upright(new THREE.ShapeGeometry(flagShape)), primary, [2, 0, 43]);
    add(new THREE.BoxGeometry(5, 5, 25), secondary, [0, 0, 51]);
  } else {
    add(upright(new THREE.CylinderGeometry(18, 22, 28, 8)), secondary, [0, 0, 24]);
    add(upright(new THREE.OctahedronGeometry(14, 0)), glow, [0, 0, 46]);
    for (let arm = 0; arm < 3; arm += 1) {
      add(new THREE.BoxGeometry(54, 10, 9), primary, [0, 0, 17], (Math.PI / 3) * arm);
    }
    add(new THREE.TorusGeometry(26, 4, 6, 24), metal, [0, 0, 15]);
  }

  const statusMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.selected,
    depthWrite: false,
    opacity: 0.82,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const statusRing = new THREE.Mesh(new THREE.RingGeometry(31, 36, 40), statusMaterial);
  statusRing.position.z = 2;
  statusRing.renderOrder = 2;
  statusRing.visible = false;
  root.add(statusRing);

  const deployedRings = new THREE.Group();
  for (const radius of [34, 43]) {
    const material = new THREE.MeshBasicMaterial({
      color: teamColor,
      depthWrite: false,
      opacity: radius === 34 ? 0.5 : 0.24,
      transparent: true,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.8, 5, 40), material);
    ring.position.z = 3;
    deployedRings.add(ring);
  }
  deployedRings.visible = false;
  root.add(deployedRings);
  return { root, body, materials, geometries, statusRing, deployedRings };
}

class PlayerPiece {
  readonly id: string;
  readonly root: THREE.Group;
  private readonly model: PieceModel;
  private segments: Array<{ from: Hex; to: Hex }> = [];
  private segmentProgress = 0;
  private pulseTime = 0;
  private baseHeight = TILE_HEIGHT + 2;
  private selected = false;
  private pressured = false;

  constructor(scene: THREE.Scene, piece: PieceState) {
    this.id = piece.id;
    this.model = createPieceModel(piece);
    this.root = this.model.root;
    scene.add(this.root);
    this.sync(piece, false, false);
  }

  sync(piece: PieceState, selected: boolean, previewed: boolean): void {
    this.root.visible = piece.status === 'deployed' && piece.hex !== null;
    if (!this.root.visible || !piece.hex) return;
    if (!this.isMoving) this.setWorldPosition(piece.hex);
    this.baseHeight = TILE_HEIGHT + 2;
    this.root.position.z = this.baseHeight;
    this.root.scale.setScalar(1.45);
    const anchorScale = piece.type === 'anchor' && piece.stance === 'deployed' ? 1.16 : 1;
    this.model.body.scale.set(anchorScale, anchorScale, anchorScale);
    this.model.deployedRings.visible = piece.type === 'anchor' && piece.stance === 'deployed';
    this.selected = selected;
    this.pressured = piece.pressured;
    this.model.statusRing.visible = selected || piece.pressured;
    this.model.statusRing.material.color.setHex(
      piece.pressured ? COLORS.pressure : COLORS.selected,
    );
    for (const material of this.model.materials) {
      material.transparent = previewed;
      material.opacity = previewed ? 0.58 : 1;
      material.emissive.setHex(
        piece.pressured ? COLORS.pressure : selected ? COLORS.selected : material.color.getHex(),
      );
      material.emissiveIntensity = piece.pressured
        ? 0.32
        : selected
          ? 0.18
          : material === this.model.materials[3]
            ? 0.65
            : 0;
    }
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
    if (!this.root.visible) return;
    this.pulseTime += deltaSeconds;
    if (this.model.statusRing.visible) {
      const pulse = 1 + Math.sin(this.pulseTime * 5) * (this.pressured ? 0.09 : 0.05);
      this.model.statusRing.scale.setScalar(pulse);
      this.model.statusRing.material.opacity = this.pressured ? 0.9 : this.selected ? 0.72 : 0;
    }
    if (this.model.deployedRings.visible) {
      this.model.deployedRings.rotation.z += deltaSeconds * 0.35;
      this.model.deployedRings.scale.setScalar(1 + Math.sin(this.pulseTime * 2) * 0.04);
    }
    if (this.segments.length === 0) return;
    this.segmentProgress += deltaSeconds / 0.2;
    const segment = this.segments[0];
    const start = hexToWorld(segment.from);
    const end = hexToWorld(segment.to);
    const progress = Math.min(this.segmentProgress, 1);
    this.root.position.x = THREE.MathUtils.lerp(start.x, end.x, progress);
    this.root.position.y = THREE.MathUtils.lerp(start.y, end.y, progress);
    this.root.position.z = this.baseHeight + Math.sin(progress * Math.PI) * 20;
    if (this.segmentProgress >= 1) {
      this.setWorldPosition(segment.to);
      this.root.position.z = this.baseHeight;
      this.segments.shift();
      this.segmentProgress = 0;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    for (const geometry of this.model.geometries) geometry.dispose();
    for (const material of this.model.materials) material.dispose();
    this.model.statusRing.geometry.dispose();
    this.model.statusRing.material.dispose();
    for (const ring of this.model.deployedRings.children) {
      if (ring instanceof THREE.Mesh) {
        ring.geometry.dispose();
        if (ring.material instanceof THREE.Material) ring.material.dispose();
      }
    }
  }

  private setWorldPosition(hex: Hex): void {
    const { x, y } = hexToWorld(hex);
    this.root.position.x = x;
    this.root.position.y = y;
  }
}

export class GameEngine {
  private readonly container: HTMLElement;
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly raycaster = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly boardCenter: THREE.Vector3;
  private readonly boardScale: number;
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
  private keyboardStage: 'pieces' | 'destinations' | null = null;
  private keyboardDestination?: Hex;
  private mode: MatchMode = 'ai';
  private aiThinking = false;
  private readonly aiTimers = new Set<number>();
  private readonly handleResize: () => void;
  private readonly handlePointerMove: (event: PointerEvent) => void;
  private readonly handlePointerLeave: () => void;
  private readonly handlePointerDown: (event: PointerEvent) => void;
  private readonly handlePointerUp: (event: PointerEvent) => void;
  private readonly handlePointerCancel: (event: PointerEvent) => void;
  private readonly handleKeyDown: (event: KeyboardEvent) => void;
  private drag:
    | {
        pointerId: number;
        x: number;
        y: number;
        camera: THREE.Vector3;
        target: THREE.Vector3;
        moved: boolean;
      }
    | undefined;

  constructor(container: HTMLElement, onViewChange: (view: GameView) => void) {
    this.container = container;
    this.onViewChange = onViewChange;
    const metrics = boardMetrics(this.state.board);
    this.boardCenter = metrics.center;
    this.boardScale = metrics.width / 1696;
    this.cameraTarget.copy(this.boardCenter);
    this.timer.connect(document);
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 1800 * this.boardScale, 3100 * this.boardScale);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive HexWar battlefield');
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x111827, 1.85));
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 4.1);
    keyLight.position.set(this.boardCenter.x - 450, this.boardCenter.y - 650, 1150);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -1400;
    keyLight.shadow.camera.right = 1400;
    keyLight.shadow.camera.top = 1100;
    keyLight.shadow.camera.bottom = -1100;
    keyLight.shadow.camera.near = 200;
    keyLight.shadow.camera.far = 2600;
    keyLight.shadow.bias = -0.00035;
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x6ea8ff, 1.6);
    rimLight.position.set(this.boardCenter.x + 900, this.boardCenter.y + 500, 650);
    this.scene.add(rimLight);

    this.tileManager = new TileManager(this.scene, this.state.board);
    this.syncScene();
    this.handleResize = this.resize.bind(this);
    this.handlePointerMove = this.pointerMove.bind(this);
    this.handlePointerLeave = () => {
      if (this.drag) return;
      this.pointer.set(2, 2);
      this.setHoveredHex(undefined);
    };
    this.handlePointerDown = this.pointerDown.bind(this);
    this.handlePointerUp = this.pointerUp.bind(this);
    this.handlePointerCancel = this.pointerCancel.bind(this);
    this.handleKeyDown = this.keyDown.bind(this);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    this.resize();
    this.renderer.setAnimationLoop(() => this.render());
    this.publish();
  }

  reset(mode: MatchMode = this.mode): void {
    this.clearAiTimers();
    this.mode = mode;
    this.aiThinking = false;
    this.state = createInitialState();
    this.cameraTarget.copy(this.boardCenter);
    this.resize();
    this.clearPlanning();
    this.syncScene();
    this.publish();
  }

  selectReserve(pieceId: string): void {
    if (!this.canHumanAct() || this.plannedAction || this.state.phase !== 'action') return;
    const piece = getPiece(this.state, pieceId);
    if (piece?.team !== this.state.activeTeam || piece.status !== 'reserve') return;
    this.selectedPieceId = pieceId;
    this.keyboardStage = null;
    this.keyboardDestination = undefined;
    this.syncScene();
    this.publish();
  }

  selectPiece(pieceId: string): void {
    if (!this.canHumanAct() || this.plannedAction || this.state.phase !== 'action') return;
    const piece = getPiece(this.state, pieceId);
    if (piece?.team !== this.state.activeTeam || piece.status !== 'deployed') return;
    this.selectedPieceId = pieceId;
    this.keyboardStage = null;
    this.keyboardDestination = undefined;
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
    window.removeEventListener('keydown', this.handleKeyDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
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
    const horizontalDistance =
      window.innerWidth > 900
        ? (2200 * this.boardScale) / Math.max(this.camera.aspect, 0.55)
        : (1020 * this.boardScale) / Math.max(this.camera.aspect, 0.55);
    const distanceFromBoard = Math.max(1250 * this.boardScale, horizontalDistance);
    this.camera.position.set(
      this.cameraTarget.x,
      this.cameraTarget.y - distanceFromBoard * 0.82,
      distanceFromBoard * 0.78,
    );
    this.camera.lookAt(this.cameraTarget);
  }

  private updatePointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private pointerMove(event: PointerEvent): void {
    this.updatePointer(event);
    if (this.drag?.pointerId === event.pointerId) {
      const deltaX = event.clientX - this.drag.x;
      const deltaY = event.clientY - this.drag.y;
      if (Math.hypot(deltaX, deltaY) > 5) this.drag.moved = true;
      if (this.drag.moved) {
        this.pan(deltaX, deltaY);
        this.setHoveredHex(undefined);
        this.renderer.domElement.classList.add('is-panning');
        return;
      }
    }
    this.setHoveredHex(this.intersectedHex());
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camera: this.camera.position.clone(),
      target: this.cameraTarget.clone(),
      moved: false,
    };
  }

  private pointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    const wasMoved = this.drag.moved;
    this.drag = undefined;
    this.renderer.domElement.classList.remove('is-panning');
    this.renderer.domElement.releasePointerCapture(event.pointerId);
    if (!wasMoved) this.activatePointer(event);
  }

  private pointerCancel(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    this.renderer.domElement.classList.remove('is-panning');
  }

  private activatePointer(event: PointerEvent): void {
    if (
      !this.canHumanAct() ||
      this.anyPieceMoving() ||
      this.plannedAction ||
      this.state.phase === 'game-over'
    )
      return;
    this.updatePointer(event);
    this.keyboardStage = null;
    this.keyboardDestination = undefined;
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

  private pan(deltaX: number, deltaY: number): void {
    if (!this.drag) return;
    const distance = this.drag.camera.distanceTo(this.drag.target);
    const worldPerPixel =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
      Math.max(this.renderer.domElement.clientHeight, 1);
    const right = new THREE.Vector3()
      .setFromMatrixColumn(this.camera.matrix, 0)
      .setZ(0)
      .normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1).setZ(0).normalize();
    const offset = right
      .multiplyScalar(-deltaX * worldPerPixel)
      .add(up.multiplyScalar(deltaY * worldPerPixel));
    const target = this.drag.target.clone().add(offset);
    target.x = THREE.MathUtils.clamp(
      target.x,
      this.boardCenter.x - 590 * this.boardScale,
      this.boardCenter.x + 590 * this.boardScale,
    );
    target.y = THREE.MathUtils.clamp(
      target.y,
      this.boardCenter.y - 370 * this.boardScale,
      this.boardCenter.y + 370 * this.boardScale,
    );
    const clampedOffset = target.clone().sub(this.drag.target);
    this.cameraTarget.copy(target);
    this.camera.position.copy(this.drag.camera).add(clampedOffset);
    this.camera.lookAt(this.cameraTarget);
  }

  private keyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, a')) return;
    if (event.key === 'Enter' && target?.closest('.confirmation button')) return;
    if (!this.canHumanAct() || this.state.phase === 'game-over') return;
    if (event.key.startsWith('Arrow') && !this.plannedAction) {
      event.preventDefault();
      if (this.keyboardStage === 'destinations' || this.state.phase === 'retreat') {
        if (this.keyboardStage !== 'destinations') this.beginKeyboardDestinations();
        this.moveKeyboardDestination(event.key);
      } else {
        this.cycleKeyboardPiece(event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      }
    } else if (event.key === 'Enter' && this.plannedAction) {
      event.preventDefault();
      this.confirm();
    } else if (event.key === 'Enter' && this.keyboardStage === 'destinations') {
      event.preventDefault();
      this.planKeyboardDestination();
    } else if (event.key === 'Enter' && this.selectedPieceId) {
      event.preventDefault();
      this.beginKeyboardDestinations();
    } else if (event.key === 'Escape' && this.plannedAction) {
      event.preventDefault();
      this.cancel();
    } else if (event.key === 'Escape' && this.keyboardStage === 'destinations') {
      event.preventDefault();
      this.keyboardStage = 'pieces';
      this.keyboardDestination = undefined;
      this.publish();
    } else if (event.key === 'Escape' && this.keyboardStage === 'pieces') {
      event.preventDefault();
      this.selectedPieceId = null;
      this.keyboardStage = null;
      this.syncScene();
      this.publish();
    }
  }

  private cycleKeyboardPiece(step: -1 | 1): void {
    if (this.state.phase !== 'action') return;
    const pieces = this.state.pieces.filter(
      (piece) => piece.team === this.state.activeTeam && piece.status !== 'cooling',
    );
    if (pieces.length === 0) return;
    const current = pieces.findIndex(({ id }) => id === this.selectedPieceId);
    const index =
      current < 0
        ? step > 0
          ? 0
          : pieces.length - 1
        : (current + step + pieces.length) % pieces.length;
    this.selectedPieceId = pieces[index].id;
    this.keyboardStage = 'pieces';
    this.keyboardDestination = undefined;
    this.syncScene();
    this.publish();
  }

  private beginKeyboardDestinations(): void {
    if (!this.selectedPieceId) return;
    const destinations =
      this.state.phase === 'retreat'
        ? this.retreatDestinations()
        : this.destinationActions()
            .filter(
              (action): action is Extract<GameAction, { type: 'move' | 'deploy' }> =>
                action.type === 'move' || action.type === 'deploy',
            )
            .map(({ to }) => to);
    if (destinations.length === 0) {
      const stance = getLegalActions(this.state).find(
        (action) => action.type === 'stance' && action.pieceId === this.selectedPieceId,
      );
      if (stance) this.plan(stance);
      return;
    }
    const piece = getPiece(this.state, this.selectedPieceId);
    this.keyboardStage = 'destinations';
    this.keyboardDestination = cloneHex(
      piece?.hex
        ? [...destinations].sort(
            (first, second) => distance(piece.hex!, first) - distance(piece.hex!, second),
          )[0]
        : destinations[0],
    );
    this.publish();
  }

  private moveKeyboardDestination(key: string): void {
    const destinations = this.legalDestinations();
    if (destinations.length === 0) return;
    if (!this.keyboardDestination) {
      this.keyboardDestination = cloneHex(destinations[0]);
      this.publish();
      return;
    }
    const origin = this.projectHex(this.keyboardDestination);
    const direction =
      key === 'ArrowLeft'
        ? new THREE.Vector2(-1, 0)
        : key === 'ArrowRight'
          ? new THREE.Vector2(1, 0)
          : key === 'ArrowUp'
            ? new THREE.Vector2(0, 1)
            : new THREE.Vector2(0, -1);
    const candidate = destinations
      .filter((hex) => !sameHex(hex, this.keyboardDestination!))
      .map((hex) => {
        const offset = this.projectHex(hex).sub(origin);
        const length = offset.length();
        const alignment = length === 0 ? -1 : offset.dot(direction) / length;
        return { hex, alignment, length };
      })
      .filter(({ alignment }) => alignment > 0.25)
      .sort(
        (first, second) => second.alignment - first.alignment || first.length - second.length,
      )[0];
    if (!candidate) return;
    this.keyboardDestination = cloneHex(candidate.hex);
    this.publish();
  }

  private projectHex(hex: Hex): THREE.Vector2 {
    const world = hexToWorld(hex);
    const projected = new THREE.Vector3(world.x, world.y, TILE_HEIGHT).project(this.camera);
    return new THREE.Vector2(projected.x, projected.y);
  }

  private planKeyboardDestination(): void {
    if (!this.keyboardDestination) return;
    if (this.state.phase === 'retreat') {
      this.chooseRetreat(this.keyboardDestination);
      return;
    }
    const action = this.destinationActions().find(
      (candidate) =>
        (candidate.type === 'move' || candidate.type === 'deploy') &&
        sameHex(candidate.to, this.keyboardDestination!),
    );
    if (action) this.plan(action);
  }

  private setHoveredHex(hex: Hex | undefined): void {
    if (sameHex(this.hoveredHex ?? null, hex ?? null)) return;
    this.hoveredHex = hex;
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
    this.keyboardStage = null;
    this.keyboardDestination = undefined;
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
    this.tileManager.applyTiles(
      display.tiles,
      this.previewState ? this.state.tiles : undefined,
      this.previewState ? this.state.activeTeam : undefined,
    );
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
    if (this.keyboardStage === 'pieces') return [];
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
      hoveredHex: this.hoveredHex ? cloneHex(this.hoveredHex) : null,
      keyboardStage: this.keyboardStage,
      keyboardDestination: this.keyboardDestination ? cloneHex(this.keyboardDestination) : null,
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
    this.tileManager.setHighlights(destinations, this.keyboardDestination ?? this.hoveredHex);
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.rendered = 'true';
    this.renderer.domElement.dataset.turn = String(this.state.turn);
    this.renderer.domElement.dataset.phase = this.state.phase;
    this.renderer.domElement.dataset.keyboardStage = this.keyboardStage ?? 'none';
    if (this.keyboardDestination)
      this.renderer.domElement.dataset.keyboardHex = hexKey(this.keyboardDestination);
    else delete this.renderer.domElement.dataset.keyboardHex;
    this.renderer.domElement.dataset.cameraTarget = `${Math.round(this.cameraTarget.x)},${Math.round(
      this.cameraTarget.y,
    )}`;
    if (this.plannedAction)
      this.renderer.domElement.dataset.plannedAction = actionKey(this.plannedAction);
    else delete this.renderer.domElement.dataset.plannedAction;
  }
}

const cloneHex = ([column, row]: Hex): Hex => [column, row];

import * as THREE from 'three';
import { distance, hexKey, shortestPath } from './hex.js';
import type { Hex } from './hex.js';

export const TEAM_NAMES = ['Violet', 'Crimson'] as const;

type Team = 0 | 1;
type TilePreview = 'none' | 'highlight' | 'onPath' | 'outOfRange';
type ActivePreview = Exclude<TilePreview, 'none'>;

interface PreviewMap {
  onPath: Hex[];
  outOfRange: Hex[];
  highlight: Hex[];
}

interface MovementSegment {
  from: Hex;
  to: Hex;
}

export interface GameSnapshot {
  currentTeamTurn: Team;
  teamName: (typeof TEAM_NAMES)[Team];
  turn: number;
  movesRemaining: number;
  totalInfluence: [number, number, number];
  hasSelection: boolean;
}

export const COLORS = {
  violet: 0x9b5de5,
  violetDark: 0x6337a3,
  crimson: 0xff4d6d,
  crimsonDark: 0xa4133c,
  selected: 0xf8fafc,
  base: 0x3a86ff,
  highlight: 0xffbe0b,
  path: 0x35d07f,
  outOfRange: 0x526175,
};

const HALF_EDGE = 40;
const TILE_HEIGHT = 8;
const BOARD_COLUMNS = 13;
const BOARD_ROWS = 7;
const MOVES_PER_TURN = 4;

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
  team: Team | null;
  preview: TilePreview;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;

  constructor(hex: Hex, geometry: THREE.ExtrudeGeometry) {
    this.hex = hex;
    this.team = null;
    this.preview = 'none';
    this.material = new THREE.MeshStandardMaterial({
      color: COLORS.base,
      roughness: 0.72,
      metalness: 0.04,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    const { x, y } = hexToWorld(hex);
    this.mesh.position.set(x, y, 0);
    this.mesh.userData.tile = this;
  }

  setPreview(preview: TilePreview): void {
    if (preview !== this.preview) {
      this.preview = preview;
      this.updateColor();
    }
  }

  capture(team: Team | null): void {
    if (team !== this.team) {
      this.team = team;
      this.updateColor();
    }
  }

  updateColor(): void {
    const previewColors: Partial<Record<TilePreview, number>> = {
      highlight: COLORS.highlight,
      onPath: COLORS.path,
      outOfRange: COLORS.outOfRange,
    };
    const teamColors: [number, number] = [COLORS.violet, COLORS.crimson];
    const color =
      previewColors[this.preview] ?? (this.team === null ? COLORS.base : teamColors[this.team]);
    this.material.color.setHex(color);
  }
}

class TileManager {
  readonly group: THREE.Group;
  readonly tiles: Map<string, Tile>;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'battlefield';
    this.tiles = new Map();
    const geometry = makeHexGeometry();

    for (let column = 0; column < BOARD_COLUMNS; column += 1) {
      const height = column % 2 === 0 ? BOARD_ROWS : BOARD_ROWS - 1;
      for (let row = 0; row < height; row += 1) {
        const tile = new Tile([column, row], geometry);
        this.tiles.set(hexKey(tile.hex), tile);
        this.group.add(tile.mesh);
      }
    }

    scene.add(this.group);
  }

  intersect(raycaster: THREE.Raycaster): Hex | undefined {
    const intersection = raycaster.intersectObjects(this.group.children, false)[0];
    return (intersection?.object.userData.tile as Tile | undefined)?.hex;
  }

  getHexes(): Hex[] {
    return [...this.tiles.values()].map((tile) => tile.hex);
  }

  setPreviews(previews: PreviewMap): void {
    for (const tile of this.tiles.values()) {
      tile.setPreview('none');
    }
    for (const [preview, hexes] of Object.entries(previews) as Array<[ActivePreview, Hex[]]>) {
      for (const hex of hexes) {
        this.tiles.get(hexKey(hex))?.setPreview(preview);
      }
    }
  }

  capture(hex: Hex, team: Team | null): void {
    this.tiles.get(hexKey(hex))?.capture(team);
  }
}

class Player {
  hex: Hex;
  readonly team: Team;
  selected: boolean;
  segments: MovementSegment[];
  segmentProgress: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;

  constructor(scene: THREE.Scene, hex: Hex, team: Team) {
    this.hex = hex;
    this.team = team;
    this.selected = false;
    this.segments = [];
    this.segmentProgress = 0;

    const geometry = new THREE.CylinderGeometry(10, 30, 80, 6);
    this.material = new THREE.MeshStandardMaterial({
      color: team === 0 ? COLORS.violetDark : COLORS.crimsonDark,
      roughness: 0.45,
      metalness: 0.12,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.z = TILE_HEIGHT + 40;
    this.setWorldPosition(hex);
    scene.add(this.mesh);
  }

  setWorldPosition(hex: Hex): void {
    const { x, y } = hexToWorld(hex);
    this.mesh.position.x = x;
    this.mesh.position.y = y;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.material.emissive.setHex(selected ? COLORS.selected : 0x000000);
    this.material.emissiveIntensity = selected ? 0.55 : 0;
  }

  moveOnPath(path: Hex[]): void {
    this.hex = path.at(-1)!;
    this.segments = path.slice(1).map((to, index) => ({
      from: path[index],
      to,
    }));
    this.segmentProgress = 0;
  }

  update(deltaSeconds: number): void {
    if (this.selected) {
      this.mesh.rotation.y += deltaSeconds * 2.4;
    }

    if (this.segments.length === 0) return;
    this.segmentProgress += deltaSeconds / 0.16;

    while (this.segmentProgress >= 1 && this.segments.length > 0) {
      const completed = this.segments.shift()!;
      this.setWorldPosition(completed.to);
      this.segmentProgress -= 1;
    }

    if (this.segments.length > 0) {
      const { from, to } = this.segments[0];
      const start = hexToWorld(from);
      const end = hexToWorld(to);
      this.mesh.position.x = THREE.MathUtils.lerp(start.x, end.x, this.segmentProgress);
      this.mesh.position.y = THREE.MathUtils.lerp(start.y, end.y, this.segmentProgress);
    }
  }
}

class Game {
  private readonly scene: THREE.Scene;
  private readonly tileManager: TileManager;
  private readonly onChange: (snapshot: GameSnapshot) => void;
  private players: Player[];
  private selectedPlayer: Player | null = null;
  private currentTeamTurn: Team = 0;
  private turn = 1;
  private movesRemaining = MOVES_PER_TURN;
  private totalInfluence: [number, number, number] = [0, 0, 0];

  constructor(
    scene: THREE.Scene,
    tileManager: TileManager,
    onChange: (snapshot: GameSnapshot) => void,
  ) {
    this.scene = scene;
    this.tileManager = tileManager;
    this.onChange = onChange;
    this.players = [];
    this.reset();
  }

  reset(): void {
    for (const player of this.players) {
      this.scene.remove(player.mesh);
      player.mesh.geometry.dispose();
      player.material.dispose();
    }

    this.players = [];
    this.selectedPlayer = null;
    this.currentTeamTurn = 0;
    this.turn = 1;
    this.movesRemaining = MOVES_PER_TURN;
    this.totalInfluence = [0, 0, 0];

    const startingPlayers: Array<[Hex, Team]> = [
      [[0, 1], 0],
      [[0, 3], 0],
      [[0, 5], 0],
      [[12, 1], 1],
      [[12, 3], 1],
      [[12, 5], 1],
    ];
    for (const [hex, team] of startingPlayers) {
      this.players.push(new Player(this.scene, hex, team));
    }
    this.updateTerritory();
    this.notify();
  }

  snapshot(): GameSnapshot {
    return {
      currentTeamTurn: this.currentTeamTurn,
      teamName: TEAM_NAMES[this.currentTeamTurn],
      turn: this.turn,
      movesRemaining: this.movesRemaining,
      totalInfluence: [...this.totalInfluence] as [number, number, number],
      hasSelection: this.selectedPlayer !== null,
    };
  }

  notify(): void {
    this.onChange(this.snapshot());
  }

  nextTurn(): void {
    this.deselect(false);
    this.currentTeamTurn = this.currentTeamTurn === 0 ? 1 : 0;
    this.turn += 1;
    this.movesRemaining = MOVES_PER_TURN;
  }

  availableHexes(): Set<string> {
    const available = new Set(this.tileManager.getHexes().map(hexKey));
    for (const player of this.players) {
      available.delete(hexKey(player.hex));
    }
    if (this.selectedPlayer) {
      available.add(hexKey(this.selectedPlayer.hex));
    }
    return available;
  }

  selectHex(selectedHex: Hex): void {
    if (!this.selectedPlayer) {
      const player = this.players.find(({ hex }) => hexKey(hex) === hexKey(selectedHex));
      if (player?.team === this.currentTeamTurn && player.segments.length === 0) {
        player.setSelected(true);
        this.selectedPlayer = player;
        this.notify();
      }
      return;
    }

    const path = shortestPath(this.selectedPlayer.hex, selectedHex, this.availableHexes());
    if (!path || path.length - 1 > this.movesRemaining) return;
    const moveCost = path.length - 1;

    this.selectedPlayer.moveOnPath(path);
    this.selectedPlayer.setSelected(false);
    this.selectedPlayer = null;
    this.movesRemaining -= moveCost;
    this.updateTerritory();
    if (this.movesRemaining === 0) this.nextTurn();
    this.notify();
  }

  deselect(shouldNotify = true): void {
    if (this.selectedPlayer) {
      this.selectedPlayer.setSelected(false);
      this.selectedPlayer = null;
      if (shouldNotify) this.notify();
    }
  }

  update(deltaSeconds: number): void {
    for (const player of this.players) player.update(deltaSeconds);
  }

  updateTerritory(): void {
    const totals: [number, number, number] = [0, 0, 0];
    for (const hex of this.tileManager.getHexes()) {
      const influence: [number, number] = [0, 0];
      for (const player of this.players) {
        influence[player.team] += 2 ** (5 - distance(player.hex, hex));
      }

      let team: Team | null = null;
      if (influence[0] >= influence[1] + 6 && influence[0] >= 16) team = 0;
      if (influence[1] >= influence[0] + 6 && influence[1] >= 16) team = 1;
      this.tileManager.capture(hex, team);
      totals[team === null ? 2 : team] += 1;
    }
    this.totalInfluence = totals;
  }

  previewsFor(hoveredHex?: Hex): PreviewMap {
    const previews: PreviewMap = { onPath: [], outOfRange: [], highlight: [] };
    if (!hoveredHex) return previews;

    if (!this.selectedPlayer) {
      previews.highlight.push(hoveredHex);
      return previews;
    }

    const available = this.availableHexes();
    let path = shortestPath(this.selectedPlayer.hex, hoveredHex, available);
    let valid = true;
    if (!path) {
      available.add(hexKey(hoveredHex));
      path = shortestPath(this.selectedPlayer.hex, hoveredHex, available);
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
}

export class GameEngine {
  private readonly container: HTMLElement;
  private readonly pointer: THREE.Vector2;
  private readonly raycaster: THREE.Raycaster;
  private readonly timer: THREE.Timer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly tileManager: TileManager;
  private readonly game: Game;
  private readonly handleResize: () => void;
  private readonly handlePointerMove: (event: PointerEvent) => void;
  private readonly handlePointerLeave: () => void;
  private readonly handlePointerDown: (event: PointerEvent) => void;

  constructor(container: HTMLElement, onStateChange: (snapshot: GameSnapshot) => void) {
    this.container = container;
    this.pointer = new THREE.Vector2(2, 2);
    this.raycaster = new THREE.Raycaster();
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 1650, 2600);

    this.camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive HexWar battlefield');
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xc7dcff, 0x172036, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(500, -400, 900);
    this.scene.add(keyLight);

    this.tileManager = new TileManager(this.scene);
    this.game = new Game(this.scene, this.tileManager, onStateChange);

    this.handleResize = this.resize.bind(this);
    this.handlePointerMove = this.pointerMove.bind(this);
    this.handlePointerLeave = () => this.pointer.set(2, 2);
    this.handlePointerDown = this.pointerDown.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);

    this.resize();
    this.renderer.setAnimationLoop(() => this.render());
  }

  reset(): void {
    this.game.reset();
  }

  resize(): void {
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

  updatePointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  pointerMove(event: PointerEvent): void {
    this.updatePointer(event);
  }

  pointerDown(event: PointerEvent): void {
    this.updatePointer(event);
    const clickedHex = this.intersectedHex();
    if (clickedHex) this.game.selectHex(clickedHex);
    else this.game.deselect();
  }

  intersectedHex(): Hex | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.tileManager.intersect(this.raycaster);
  }

  render(): void {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    this.game.update(delta);
    this.tileManager.setPreviews(this.game.previewsFor(this.intersectedHex()));
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.rendered = 'true';
  }

  destroy(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

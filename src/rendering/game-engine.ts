import * as THREE from 'three';
import { createBoardHexes, GameModel } from '../model/game.js';
import { hexKey } from '../model/hex.js';
import type { GameSnapshot, PreviewMap, Team } from '../model/game.js';
import type { Hex } from '../model/hex.js';

type TilePreview = 'none' | 'highlight' | 'onPath' | 'outOfRange';
type ActivePreview = Exclude<TilePreview, 'none'>;

interface MovementSegment {
  from: Hex;
  to: Hex;
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

  constructor(scene: THREE.Scene, boardHexes: Hex[]) {
    this.group = new THREE.Group();
    this.group.name = 'battlefield';
    this.tiles = new Map();
    const geometry = makeHexGeometry();

    for (const hex of boardHexes) {
      const tile = new Tile(hex, geometry);
      this.tiles.set(hexKey(tile.hex), tile);
      this.group.add(tile.mesh);
    }

    scene.add(this.group);
  }

  intersect(raycaster: THREE.Raycaster): Hex | undefined {
    const intersection = raycaster.intersectObjects(this.group.children, false)[0];
    return (intersection?.object.userData.tile as Tile | undefined)?.hex;
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

  applyTerritory(territory: ReadonlyMap<string, Team | null>): void {
    for (const tile of this.tiles.values()) {
      tile.capture(territory.get(hexKey(tile.hex)) ?? null);
    }
  }

  dispose(scene: THREE.Scene): void {
    const geometry = this.group.children[0]?.userData.tile.mesh.geometry as
      THREE.ExtrudeGeometry | undefined;
    for (const tile of this.tiles.values()) tile.material.dispose();
    geometry?.dispose();
    scene.remove(this.group);
  }
}

class Player {
  readonly id: string;
  readonly team: Team;
  selected: boolean;
  segments: MovementSegment[];
  segmentProgress: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;

  constructor(scene: THREE.Scene, id: string, hex: Hex, team: Team) {
    this.id = id;
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
    this.segments = path.slice(1).map((to, index) => ({
      from: path[index],
      to,
    }));
    this.segmentProgress = 0;
  }

  get isMoving(): boolean {
    return this.segments.length > 0;
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

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
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
  private readonly model: GameModel;
  private readonly players = new Map<string, Player>();
  private readonly onStateChange: (snapshot: GameSnapshot) => void;
  private readonly handleResize: () => void;
  private readonly handlePointerMove: (event: PointerEvent) => void;
  private readonly handlePointerLeave: () => void;
  private readonly handlePointerDown: (event: PointerEvent) => void;

  constructor(container: HTMLElement, onStateChange: (snapshot: GameSnapshot) => void) {
    this.container = container;
    this.onStateChange = onStateChange;
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

    const boardHexes = createBoardHexes();
    this.tileManager = new TileManager(this.scene, boardHexes);
    this.model = new GameModel(boardHexes);
    this.rebuildPlayers();
    this.syncModelToScene();

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
    this.publish();
  }

  reset(): void {
    this.model.reset();
    this.rebuildPlayers();
    this.syncModelToScene();
    this.publish();
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
    if ([...this.players.values()].some((player) => player.isMoving)) return;
    const clickedHex = this.intersectedHex();
    if (clickedHex) {
      const transition = this.model.selectHex(clickedHex);
      if (!transition.changed) return;
      if (transition.movedPiece) {
        this.players.get(transition.movedPiece.id)?.moveOnPath(transition.movedPiece.path);
      }
    } else if (!this.model.deselect()) {
      return;
    }
    this.syncModelToScene();
    this.publish();
  }

  intersectedHex(): Hex | undefined {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.tileManager.intersect(this.raycaster);
  }

  render(): void {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    for (const player of this.players.values()) player.update(delta);
    this.tileManager.setPreviews(this.model.previewsFor(this.intersectedHex()));
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
    for (const player of this.players.values()) player.dispose(this.scene);
    this.players.clear();
    this.tileManager.dispose(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildPlayers(): void {
    for (const player of this.players.values()) player.dispose(this.scene);
    this.players.clear();
    for (const piece of this.model.snapshot().pieces) {
      this.players.set(piece.id, new Player(this.scene, piece.id, piece.hex, piece.team));
    }
  }

  private syncModelToScene(): void {
    const snapshot = this.model.snapshot();
    for (const player of this.players.values()) {
      player.setSelected(player.id === snapshot.selectedPieceId);
    }
    this.tileManager.applyTerritory(this.model.getTerritory());
  }

  private publish(): void {
    this.onStateChange(this.model.snapshot());
  }
}

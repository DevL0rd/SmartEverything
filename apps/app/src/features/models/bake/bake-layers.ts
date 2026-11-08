import { appendTo, type ModelSpec, type ModelSpecAnchor } from '@smarteverything/domain';
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Sprite,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { activeShot, type ChannelSignals } from '../../../components/models/channels';
import { planImpostor } from '../model/impostor-plan';
import { buildModel, type BuiltModel } from '../../../components/models/three/build-model';
import {
  createContactShadow,
  type ContactShadow,
} from '../../../components/models/three/contact-shadow';
import {
  createEmitterHalos,
  type EmitterHalos,
} from '../../../components/models/three/emitter-halo';
import {
  framedShot,
  type CameraPose,
  type Point3,
  type ViewCamera,
} from '../../../components/models/three/framing';
import type { ModelLod } from '../../../components/models/three/geometry';
import { createSceneModel, type SceneModel } from '../../../components/models/three/scene-model';
import { createSilhouette, type Silhouette } from '../../../components/models/three/silhouette';
import { createStageScene, type StageScene } from '../../../components/models/three/stage';
import type {
  BakeAnchor,
  BakeKey,
  BakeLayer,
  BakeLayerRole,
  BakePoint,
  BakeRect,
  BakeTarget,
  BakeView,
  LayersResult,
} from './bake-protocol';

export interface BakeContext {
  readonly renderer: WebGLRenderer;
  readonly environment: Texture;
  readonly view: ViewCamera;
  readonly scratch: HTMLCanvasElement;
  readonly dispose: () => void;
}

export const VIEW_LOD: Readonly<Record<BakeView, ModelLod>> = { tile: 0, card: 1, hero: 2 };

export interface BakeRig {
  readonly spec: ModelSpec;
  readonly built: BuiltModel;
  readonly live: SceneModel;
  readonly halos: EmitterHalos;
  readonly edge: Silhouette;
  readonly shadow: ContactShadow | null;
  readonly stage: StageScene;
  readonly dispose: () => void;
}

export function createBakeRig(environment: Texture, spec: ModelSpec, key: BakeKey): BakeRig {
  const options = { lod: VIEW_LOD[key.view], finish: key.finish ?? undefined, params: key.params };
  const built = buildModel(spec, options);
  const live = createSceneModel(spec, options);
  const halos = createEmitterHalos(live, key.theme);
  const edge = createSilhouette(live.object3d, key.theme);
  const shadow = createContactShadow(built, key.theme);
  const stage = createStageScene(key.theme, environment);
  stage.scene.add(live.object3d);
  if (shadow !== null) stage.scene.add(shadow.mesh);
  return {
    spec,
    built,
    live,
    halos,
    edge,
    shadow,
    stage,
    dispose: (): void => {
      shadow?.dispose();
      edge.dispose();
      halos.dispose();
      live.dispose();
      built.dispose();
      stage.dispose();
    },
  };
}

export function targetSignals(spec: ModelSpec, target: BakeTarget): ChannelSignals | null {
  const states = Object.values(spec.states ?? {});
  if (target.kind === 'keyframe') return spec.states?.[target.state] ?? null;
  return states.find((state) => activeShot(spec.shots, state)?.id === target.shotId) ?? null;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export function aimCamera(context: BakeContext, pose: CameraPose, size: CanvasSize): Camera {
  context.renderer.setPixelRatio(size.dpr);
  context.renderer.setSize(size.width, size.height, false);
  context.view.apply(pose, size.width / size.height);
  context.view.camera.updateMatrixWorld(true);
  return context.view.camera;
}

export type PassRole = 'show' | 'depth' | 'white' | 'skip';

export type Pass = (node: Object3D) => PassRole;

const SKIP = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

const DEPTH = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });

const WHITE = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: DoubleSide });

function isRenderable(node: Object3D): node is Mesh | Sprite {
  return node instanceof Mesh || node instanceof Sprite;
}

function passMaterial(role: PassRole): Material {
  if (role === 'depth') return DEPTH;
  return role === 'white' ? WHITE : SKIP;
}

function drawnNodes(root: Object3D): (Mesh | Sprite)[] {
  const found: (Mesh | Sprite)[] = [];
  root.traverse((node) => {
    if (isRenderable(node)) found.push(node);
  });
  return found;
}

export type PassRenderer = Pick<WebGLRenderer, 'render'>;

export function renderPass(renderer: PassRenderer, rig: BakeRig, camera: Camera, pass: Pass): void {
  const restore: (() => void)[] = [];
  for (const node of drawnNodes(rig.stage.scene)) {
    const role = pass(node);
    if (role === 'show') continue;
    const material: Material | Material[] = node.material;
    const leaf = node instanceof Sprite || node.children.length === 0;
    if (node instanceof Mesh && !(leaf && (role === 'skip' || material === rig.edge.material))) {
      node.material = passMaterial(role);
      restore.push(() => {
        node.material = material;
      });
      continue;
    }
    const { visible } = node;
    node.visible = false;
    restore.push(() => {
      node.visible = visible;
    });
  }
  renderer.render(rig.stage.scene, camera);
  for (const undo of restore) undo();
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function alphaBounds(
  data: ArrayLike<number>,
  width: number,
  height: number,
): PixelRect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function readBounds(context: BakeContext): PixelRect | null {
  const source = context.renderer.domElement;
  const { scratch } = context;
  scratch.width = source.width;
  scratch.height = source.height;
  const draw = scratch.getContext('2d', { willReadFrequently: true });
  if (draw === null) return null;
  draw.clearRect(0, 0, scratch.width, scratch.height);
  draw.drawImage(source, 0, 0);
  return alphaBounds(
    draw.getImageData(0, 0, scratch.width, scratch.height).data,
    scratch.width,
    scratch.height,
  );
}

export function encodeRegion(source: HTMLCanvasElement, rect: PixelRect): string {
  const crop = document.createElement('canvas');
  crop.width = rect.width;
  crop.height = rect.height;
  const draw = crop.getContext('2d');
  draw?.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return crop.toDataURL('image/png');
}

export function cssRect(rect: PixelRect, dpr: number): BakeRect {
  return { x: rect.x / dpr, y: rect.y / dpr, width: rect.width / dpr, height: rect.height / dpr };
}

export function projectPoint(
  point: Vector3,
  camera: Camera,
  width: number,
  height: number,
): BakePoint {
  const ndc = point.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
}

export function projectRect(
  points: readonly Vector3[],
  camera: Camera,
  width: number,
  height: number,
): BakeRect {
  const shown = points.map((point) => projectPoint(point, camera, width, height));
  const xs = shown.map((point) => point.x);
  const ys = shown.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function box(half: Point3): Point3[] {
  const [hx, hy, hz] = half;
  const out: Point3[] = [];
  for (const x of [-hx, hx])
    for (const y of [-hy, hy]) for (const z of [-hz, hz]) out.push([x, y, z]);
  return out;
}

export function anchorExtent(anchor: ModelSpecAnchor): readonly Point3[] {
  switch (anchor.kind) {
    case 'screen':
      return box([anchor.width / 2, anchor.height / 2, 0]);
    case 'emitter':
      return box([anchor.radius, anchor.radius, anchor.radius]);
    case 'effect': {
      const half = (anchor.size ?? 0) / 2;
      return box([half, half, half]);
    }
    case 'hit':
      return box([anchor.size[0] / 2, anchor.size[1] / 2, anchor.size[2] / 2]);
    case 'mount':
    case 'label':
      return [[0, 0, 0]];
  }
}

export function projectAnchors(rig: BakeRig, camera: Camera, size: CanvasSize): BakeAnchor[] {
  rig.live.object3d.updateMatrixWorld(true);
  const out: BakeAnchor[] = [];
  for (const anchor of rig.spec.anchors ?? []) {
    const node = rig.live.object3d.getObjectByName(anchor.id);
    if (node === undefined) continue;
    const points = anchorExtent(anchor).map((p) =>
      new Vector3(...p).applyMatrix4(node.matrixWorld),
    );
    out.push({
      id: anchor.id,
      kind: anchor.kind,
      rect: projectRect(points, camera, size.width, size.height),
    });
  }
  return out;
}

const SPATIAL = new Set(['rotate', 'translate', 'scale', 'opacity', 'visible']);

export function movingGroups(
  spec: ModelSpec,
  view: BakeView,
  built: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const modes = new Map(planImpostor(spec, view).channels.map((c) => [c.id, c.mode]));
  const groups = new Map<string, string[]>();
  for (const channel of spec.channels ?? []) {
    if (modes.get(channel.id) !== 'affine' || !SPATIAL.has(channel.property)) continue;
    if (!built.has(channel.target)) continue;
    appendTo(groups, channel.target, channel.id);
  }
  return groups;
}

export function groupOf(node: Object3D, groups: ReadonlyMap<string, unknown>): string | null {
  for (let at: Object3D | null = node; at !== null; at = at.parent) {
    if (groups.has(at.name)) return at.name;
  }
  return null;
}

export function glowingParts(spec: ModelSpec): ReadonlySet<string> {
  const lit = (spec.channels ?? []).filter(
    (c) => c.property === 'emissive' || c.property === 'colour',
  );
  return new Set(lit.map((c) => c.target));
}

function glows(node: Object3D, lit: ReadonlySet<string>): boolean {
  if (!(node instanceof Mesh)) return false;
  if (lit.has(node.name)) return true;
  const material: unknown = node.material;
  return (
    material instanceof MeshPhysicalMaterial &&
    material.emissiveIntensity > 0 &&
    !material.emissive.equals(BLACK)
  );
}

const BLACK = new Color(0x000000);

interface LayerPlan {
  readonly id: string;
  readonly role: BakeLayerRole;
  readonly pass: Pass;
  readonly channels: readonly string[];
}

function occluder(rig: BakeRig, node: Object3D, groups: ReadonlyMap<string, unknown>): PassRole {
  if (node === rig.shadow?.mesh || node instanceof Sprite) return 'skip';
  return groupOf(node, groups) === null ? 'depth' : 'skip';
}

export function layerPlans(
  rig: BakeRig,
  groups: ReadonlyMap<string, readonly string[]>,
): LayerPlan[] {
  const shadow = rig.shadow?.mesh;
  const lit = glowingParts(rig.spec);
  const plans: LayerPlan[] = [
    {
      id: 'body',
      role: 'body',
      channels: [],
      pass: (node) => (node === shadow || groupOf(node, groups) !== null ? 'skip' : 'show'),
    },
  ];
  for (const [id, channels] of groups) {
    plans.push({
      id,
      role: 'part',
      channels,
      pass: (node) =>
        groupOf(node, groups) === id && node !== shadow ? 'show' : occluder(rig, node, groups),
    });
  }
  plans.push({
    id: 'emissive',
    role: 'emissive',
    channels: [],
    pass: (node) => (glows(node, lit) ? 'white' : occluder(rig, node, new Map())),
  });
  if (shadow !== undefined)
    plans.push({
      id: 'shadow',
      role: 'shadow',
      channels: [],
      pass: (node) => (node === shadow ? 'show' : 'skip'),
    });
  return plans;
}

function pivotOf(rig: BakeRig, id: string, camera: Camera, size: CanvasSize): BakePoint | null {
  const node = rig.live.object3d.getObjectByName(id);
  if (node === undefined) return null;
  return projectPoint(node.getWorldPosition(new Vector3()), camera, size.width, size.height);
}

export function stillPose(rig: BakeRig, key: BakeKey): CameraPose {
  const frame = {
    view: key.view,
    aspect: key.width / key.height,
    shot: undefined,
    elapsedS: 0,
    progress: 1,
  };
  return framedShot(rig.built, rig.spec, frame);
}

export function bakeLayers(
  context: BakeContext,
  rig: BakeRig,
  key: BakeKey,
  signals: ChannelSignals,
): Omit<LayersResult, 'id' | 'ms'> {
  rig.live.setSignals(signals, { reduced: true });
  rig.halos.sync();
  const size = { width: key.width, height: key.height, dpr: key.dpr };
  const camera = aimCamera(context, stillPose(rig, key), size);
  const groups = movingGroups(rig.spec, key.view, new Set(rig.built.parts.map((part) => part.id)));
  const layers: BakeLayer[] = [];
  for (const plan of layerPlans(rig, groups)) {
    renderPass(context.renderer, rig, camera, plan.pass);
    const bounds = readBounds(context);
    if (bounds === null) continue;
    layers.push({
      id: plan.id,
      role: plan.role,
      uri: encodeRegion(context.renderer.domElement, bounds),
      rect: cssRect(bounds, key.dpr),
      pivot: plan.role === 'part' ? pivotOf(rig, plan.id, camera, size) : null,
      channels: [...plan.channels],
    });
  }
  const anchors = projectAnchors(rig, camera, size);
  return { kind: 'layers', width: key.width, height: key.height, dpr: key.dpr, layers, anchors };
}

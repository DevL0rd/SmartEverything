import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { objectHeight, objectRing, squareRing } from '../iso/project';
import type { RenderObject, RenderPlacement, RenderPoint, RenderWall } from '../render-scene';
import type { StructureTheme } from './floor-looks';
import { addPrism, createCollector, groundPosition, type Collector, type Rgb } from './mesh';
import { mountedPose } from './wall-mounts';

export const DEVICE_BOX_METRES = 0.18;

const LABEL_LIFT_METRES = 0.08;

export type SceneItemKind = 'object' | 'device';

export interface SceneObjectLabel {
  readonly key: string;
  readonly floorId: string;
  readonly text: string;
  readonly position: readonly [number, number, number];
}

export interface UnknownBox {
  readonly key: string;
  readonly kind: SceneItemKind;
  readonly ring: readonly RenderPoint[];
  readonly base: number;
  readonly top: number;
  readonly text: string;
}

const BOX_COLOURS: Readonly<Record<StructureTheme, { readonly side: Rgb; readonly top: Rgb }>> = {
  light: { side: [0.74, 0.72, 0.69], top: [0.88, 0.86, 0.83] },
  dark: { side: [0.3, 0.32, 0.36], top: [0.44, 0.46, 0.5] },
};

export const objectKey = (id: string): string => `object:${id}`;

export const deviceKey = (deviceId: string): string => `device:${deviceId}`;

export function unknownObject(item: RenderObject): UnknownBox {
  return {
    key: objectKey(item.id),
    kind: 'object',
    ring: objectRing(item),
    base: item.elevation,
    top: item.elevation + objectHeight(item),
    text: item.label ?? item.modelId ?? item.kind,
  };
}

export function unknownDevice(
  placement: RenderPlacement,
  walls: ReadonlyMap<string, RenderWall>,
): UnknownBox {
  const half = DEVICE_BOX_METRES / 2;
  const base = Math.max(0, placement.height - half);
  const pose = mountedPose(walls, placement);
  const lift = pose.normal ?? { x: 0, y: 0 };
  const centre = { x: pose.at.x + lift.x * half, y: pose.at.y + lift.y * half };
  return {
    key: deviceKey(placement.deviceId),
    kind: 'device',
    ring: squareRing(centre, pose.rotationDeg, half, half),
    base,
    top: base + DEVICE_BOX_METRES,
    text: placement.name ?? placement.kind ?? placement.deviceId,
  };
}

function collectorGeometry(collector: Collector): BufferGeometry {
  const linear = new Float32Array(collector.colours.length);
  const colour = new Color();
  for (let index = 0; index < collector.colours.length; index += 3) {
    const [r = 0, g = 0, b = 0] = collector.colours.slice(index, index + 3);
    colour.setRGB(r, g, b, SRGBColorSpace);
    linear.set([colour.r, colour.g, colour.b], index);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(collector.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(Float32Array.from(collector.normals), 3));
  geometry.setAttribute('color', new BufferAttribute(linear, 3));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(collector.indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function boxesMesh(unknown: readonly UnknownBox[], theme: StructureTheme): Mesh | null {
  if (unknown.length === 0) return null;
  const collector = createCollector();
  const { side, top } = BOX_COLOURS[theme];
  for (const box of unknown) {
    addPrism(collector, box.ring, {
      base: box.base,
      height: box.top - box.base,
      colour: side,
      top,
    });
  }
  const mesh = new Mesh(
    collectorGeometry(collector),
    new MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.name = 'unknown-models';
  return mesh;
}

export function disposeBoxes(mesh: Mesh): void {
  mesh.geometry.dispose();
  const { material } = mesh;
  if (material instanceof MeshLambertMaterial) material.dispose();
}

export function boxBounds(box: UnknownBox, elevation: number): Box3 {
  const bounds = new Box3();
  for (const point of box.ring) {
    bounds.expandByPoint(new Vector3(...groundPosition(point, elevation + box.base)));
    bounds.expandByPoint(new Vector3(...groundPosition(point, elevation + box.top)));
  }
  return bounds;
}

export function boxLabel(box: UnknownBox, floorId: string, bounds: Box3): SceneObjectLabel {
  const centre = bounds.getCenter(new Vector3());
  const position = [centre.x, bounds.max.y + LABEL_LIFT_METRES, centre.z] as const;
  return { key: box.key, floorId, text: box.text, position };
}

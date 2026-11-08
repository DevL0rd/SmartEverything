import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { pathBuilder, type PathBuilder, type PathCommand } from '../../../helpers/path';
import { furniture, piece, type FurnitureInput, type Len, type Place } from '../../living/fc06/kit';

export {
  anchorsFor,
  block,
  by,
  corners,
  fabric,
  ferrules,
  framing,
  legs,
  piece,
  rod,
  upholsteryOf,
  woodFinishes,
  woodOf,
  type Len,
  type Lod,
  type Place,
  type Vec,
} from '../../living/fc06/kit';

export type Point = readonly [number, number];

export type Binding = NonNullable<ModelSpecPart['visible']>;

export function polygon(points: readonly Point[]): PathCommand[] {
  const [first, ...rest] = points;
  if (first === undefined) throw new Error('a polygon needs points');
  const open = rest.reduce<PathBuilder>(
    (path, [x, y]) => path.line(x, y),
    pathBuilder(first[0], first[1]),
  );
  return [...open.close().build()];
}

export interface ProfileShape {
  readonly points: readonly Point[];
  readonly depth: Len;
  readonly bevel?: number;
}

export function profile(
  id: string,
  material: string,
  shape: ProfileShape,
  place: Place = {},
): ModelSpecPart {
  return piece(
    id,
    material,
    {
      type: 'extrude',
      path: polygon(shape.points),
      depth: shape.depth,
      bevel: shape.bevel ?? 0.004,
    },
    place,
  );
}

export interface Chamfer {
  readonly front: number;
  readonly back: number;
  readonly low: number;
  readonly high: number;
  readonly cut: number;
}

export function chamfered({ front, back, low, high, cut }: Chamfer): readonly Point[] {
  return [
    [front + cut, low],
    [back - cut, low],
    [back, low + cut],
    [back, high - cut],
    [back - cut, high],
    [front + cut, high],
    [front, high - cut],
    [front, low + cut],
  ];
}

export function trimmed(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function shift(value: Len, delta: number): Len {
  return typeof value === 'number'
    ? value + delta
    : { ...value, offset: (value.offset ?? 0) + delta };
}

export function diningFurniture(input: FurnitureInput): ModelSpec {
  return { ...furniture(input), category: 'dining', states: { rest: {} } };
}

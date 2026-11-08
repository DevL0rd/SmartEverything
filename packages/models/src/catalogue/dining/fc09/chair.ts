import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  chamfered,
  diningFurniture,
  profile,
  shift,
  trimmed,
  upholsteryOf,
  woodFinishes,
  woodOf,
  type Binding,
  type Len,
  type Lod,
  type Point,
} from './kit';

const FRONT = 0.24;
const FRAME_X = 0.185;
const FRAME_T = 0.035;
const SEAT_DEPTH = 0.4;
const SPLAT_DEPTH = 0.33;

const SEAT: readonly Point[] = chamfered({
  front: -0.01,
  back: 0.43,
  low: 0.41,
  high: 0.46,
  cut: 0.012,
});

const FRAME: readonly Point[] = [
  [0, 0],
  [0.035, 0],
  [0.035, 0.36],
  [0.335, 0.36],
  [0.335, 0],
  [0.37, 0],
  [0.37, 0.41],
  [0.5, 0.86],
  [0.46, 0.86],
  [0.33, 0.41],
  [0, 0.41],
];

const SPLAT: readonly Point[] = [
  [0.363, 0.5],
  [0.389, 0.5],
  [0.476, 0.8],
  [0.45, 0.8],
];

export interface ChairSite {
  readonly id: string;
  readonly x: Len;
  readonly z: Len;
  readonly facing: number;
  readonly detail: Lod;
  readonly visible?: Binding;
  readonly seat?: string;
}

function placed(
  site: ChairSite,
  local: readonly [number, number, number],
): NonNullable<ModelSpecPart['transform']> {
  const turn = (site.facing * Math.PI) / 180;
  const [lx, ly, lz] = local;
  return {
    position: [
      shift(site.x, trimmed(lx * Math.cos(turn) + lz * Math.sin(turn))),
      ly,
      shift(site.z, trimmed(-lx * Math.sin(turn) + lz * Math.cos(turn))),
    ],
    rotation: [0, 90 + site.facing, 0],
  };
}

interface Shape {
  readonly material: string;
  readonly points: readonly Point[];
  readonly depth: number;
  readonly x: number;
  readonly minLod: Lod;
  readonly contact?: boolean;
}

function chairPart(site: ChairSite, name: string, shape: Shape): ModelSpecPart {
  const base = profile(
    `${site.id}${name}`,
    shape.material,
    { points: shape.points, depth: shape.depth },
    {
      minLod: shape.minLod,
      ...(shape.contact === undefined ? {} : { contact: shape.contact }),
    },
  );
  return {
    ...base,
    transform: placed(site, [shape.x, 0, FRONT]),
    ...(site.visible === undefined ? {} : { visible: site.visible }),
  };
}

export function chairParts(site: ChairSite): ModelSpecPart[] {
  const frame = { material: 'body', points: FRAME, depth: FRAME_T, minLod: site.detail } as const;
  return [
    chairPart(site, 'Seat', {
      material: site.seat ?? 'seat',
      points: SEAT,
      depth: SEAT_DEPTH,
      x: 0,
      minLod: 0,
    }),
    chairPart(site, 'Splat', {
      material: 'body',
      points: SPLAT,
      depth: SPLAT_DEPTH,
      x: 0,
      minLod: site.detail,
    }),
    ...[-1, 1].map((side) =>
      chairPart(site, side < 0 ? 'FrameLeft' : 'FrameRight', {
        ...frame,
        x: side * FRAME_X,
        contact: true,
      }),
    ),
  ];
}

export const CHAIR_FOOTPRINT = { width: 0.42, depth: 0.52, height: 0.87 } as const;

export const DINING_CHAIR_MODEL: ModelSpec = diningFurniture({
  id: 'cat.dining.dining-chair',
  title: 'Dining chair',
  footprint: CHAIR_FOOTPRINT,
  meta: {
    names: {
      display: 'Dining chair',
      synonyms: ['chair', 'kitchen chair', 'side chair', 'table chair', 'seat'],
    },
    sizeClass: 'small',
    aliases: ['cat.dining.chair'],
  },
  materials: { body: woodOf('oak'), seat: upholsteryOf('oat') },
  finishes: woodFinishes(['body']),
  defaultFinish: 'oak',
  parts: chairParts({ id: 'chair', x: 0, z: 0, facing: 0, detail: 0 }),
});

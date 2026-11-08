import type { ModelSpec, ModelSpecAnchor, ModelSpecPart } from '@smarteverything/domain';
import { block, by, furniture, rod, type FurnitureInput, type Len } from '../../living/fc06/kit';
import { KITCHEN_FINISH_NAMES, KITCHEN_LOOKS, type KitchenFinish } from '../fc13/kit';

export { block, by, piece, rod, type Len } from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];

type Finishes = NonNullable<ModelSpec['finishes']>;

const QUARTZ: Override = KITCHEN_LOOKS.quartz;

const STONE: Readonly<Record<KitchenFinish, Override>> = {
  ...KITCHEN_LOOKS,
  'matte-white': QUARTZ,
  sage: QUARTZ,
  navy: KITCHEN_LOOKS.marble,
};

const PAINTED: readonly KitchenFinish[] = ['matte-white', 'sage', 'navy', 'stainless'];

export const KITCHEN_MATERIALS = {
  front: { finish: 'matte-white', roughness: 0.5 },
  top: { color: '#D8D5CF', roughness: 0.32, clearcoat: 0.3 },
  trim: { finish: 'graphite' },
  accent: { finish: 'brushed-aluminium' },
} as const;

export interface CabinetSlots {
  readonly front?: boolean;
  readonly top?: boolean;
  readonly trim?: boolean;
}

export function cabinetFinishes(slots: CabinetSlots): Finishes {
  return Object.fromEntries(
    KITCHEN_FINISH_NAMES.map((name) => [
      name,
      Object.fromEntries([
        ...(slots.front === true ? [['front', KITCHEN_LOOKS[name]] as const] : []),
        ...(slots.top === true ? [['top', STONE[name]] as const] : []),
        ...(slots.trim === true && PAINTED.includes(name)
          ? [['trim', KITCHEN_LOOKS[name]] as const]
          : []),
      ]),
    ]),
  );
}

export function kitchenFurniture(input: FurnitureInput): ModelSpec {
  return { ...furniture(input), category: 'kitchen', states: { rest: {} } };
}

export function wallFurniture(input: FurnitureInput): ModelSpec {
  const { width, depth, height } = input.footprint;
  const anchors: ModelSpecAnchor[] = [
    { kind: 'mount', id: 'wall', position: [0, 0, -depth / 2], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, height + 0.12, 0] },
    { kind: 'hit', id: 'hit', position: [0, height / 2, 0], size: [width, height, depth] },
  ];
  return { ...kitchenFurniture(input), anchors };
}

const MODULE = 0.6;

export interface FrontRun {
  readonly modules: number;
  readonly y: number;
  readonly height: number;
  readonly z: number;
  readonly pullY: number;
  readonly pullLength: number;
  readonly param?: string;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function frontRun(run: FrontRun): ModelSpecPart[] {
  const param = run.param ?? 'length';
  return Array.from({ length: run.modules }, (_, index) => index + 1).flatMap((module) => {
    const centre = round4(MODULE * module - MODULE / 2);
    const visible = by(param, 1, round4(-MODULE * module + 0.01));
    const left = module % 2 === 0;
    const x: Len = by(param, -0.5, centre);
    const pullX: Len = by(param, -0.5, round4(centre + (left ? -0.25 : 0.25)));
    const name = String(module);
    return [
      {
        ...block(`door${name}`, 'front', [MODULE - 0.008, run.height, 0.018], {
          at: [x, run.y, run.z],
          round: 0.006,
          segments: 3,
        }),
        visible,
      },
      {
        ...rod(
          `pull${name}`,
          'accent',
          { height: run.pullLength, top: 0.007, segments: 12 },
          { at: [pullX, run.pullY, run.z + 0.019], minLod: 1 },
        ),
        visible,
      },
    ];
  });
}

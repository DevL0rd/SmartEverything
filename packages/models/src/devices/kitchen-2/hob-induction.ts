import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import {
  GLOW,
  HEAT,
  HOUSE,
  PRIMARY,
  WARNING,
  anchorsOf,
  glow,
  halo,
  look,
  offline,
  plane,
  pulse,
  ramp,
} from './look';

const WIDTH = 0.6;
const DEPTH = 0.52;
const GLASS_T = 0.006;
const BODY_H = 0.05;
const HEIGHT = BODY_H + GLASS_T;
const TOP = GLASS_T / 2;
const W = { param: 'width' } as const;
const FLAT: [number, number, number] = [-90, 0, 0];
const FRAME = { ...HOUSE, pitch: 35, padding: 0.1, focus: 'glass' } as const;

interface Zone {
  readonly id: string;
  readonly side: number;
  readonly z: number;
  readonly radius: number;
  readonly from: number;
}

const ZONES: readonly Zone[] = [
  { id: 'zone1', side: -1, z: 0.1, radius: 0.105, from: 0 },
  { id: 'zone2', side: 1, z: -0.11, radius: 0.105, from: 0.25 },
  { id: 'zone3', side: 1, z: 0.11, radius: 0.08, from: 0.5 },
  { id: 'zone4', side: -1, z: -0.115, radius: 0.08, from: 0.75 },
];

function at(zone: Zone, lift: number): [{ param: string; scale: number }, number, number] {
  return [{ param: 'width', scale: zone.side * 0.25 }, TOP + lift, zone.z];
}

function zoneParts(zone: Zone): ModelSpecPart[] {
  return [
    part(
      `${zone.id}Ring`,
      { type: 'ring', innerRadius: zone.radius - 0.003, outerRadius: zone.radius, segments: 64 },
      'metal',
      { parent: 'glass', transform: { position: at(zone, 0.0004), rotation: FLAT } },
    ),
    part(
      `${zone.id}Inner`,
      {
        type: 'ring',
        innerRadius: zone.radius * 0.42,
        outerRadius: zone.radius * 0.42 + 0.0016,
        segments: 48,
      },
      'metal',
      { parent: 'glass', transform: { position: at(zone, 0.0004), rotation: FLAT }, minLod: 1 },
    ),
    part(
      zone.id,
      { type: 'glow', width: zone.radius * 2.3, height: zone.radius * 2.3, segments: 24 },
      'accent',
      { parent: 'glass', transform: { position: at(zone, 0.0008), rotation: FLAT } },
    ),
    part(
      `${zone.id}Led`,
      { type: 'roundedPlane', width: 0.012, height: 0.006, radius: 0.0015, segments: 3 },
      'accent',
      {
        parent: 'glass',
        transform: {
          position: [
            { param: 'width', scale: zone.side * 0.25 + 0.06 },
            TOP + 0.0006,
            zone.z + zone.radius * 0.95,
          ],
          rotation: FLAT,
        },
        minLod: 1,
      },
    ),
  ];
}

function zoneChannels(zone: Zone): ModelSpecChannel[] {
  const span = [zone.from, Math.min(1, zone.from + 0.25)] as const;
  return [
    ramp(`${zone.id}Show`, [zone.id, 'opacity'], ['level', [span[0], span[1]], [0, 0.85]]),
    ramp(`${zone.id}Lit`, [zone.id, 'emissive'], ['level', [span[0], span[1]], [0, 1.05]]),
    ramp(`${zone.id}LedShow`, [`${zone.id}Led`, 'opacity'], ['level', [span[0], span[1]], [0, 1]]),
    ramp(`${zone.id}LedLit`, [`${zone.id}Led`, 'emissive'], ['level', [span[0], span[1]], [0, 1]]),
    look(
      `${zone.id}Tint`,
      [zone.id, 'colour'],
      ['phase', { cooking: HEAT, residual: WARNING }],
      250,
    ),
    ...glow(`${zone.id}Residual`, zone.id, ['phase', { residual: 0.35 }, { residual: 0.4 }], 450),
    ...offline(zone.id),
    ...offline(`${zone.id}Led`),
  ];
}

const PARTS: ModelSpecPart[] = [
  box('body', [0.56, BODY_H, 0.49, 0.006], 'body', {
    at: [0, BODY_H / 2, 0],
    transform: { scale: [{ param: 'width', scale: 1 / WIDTH }, 1, 1] },
    contact: true,
  }),
  {
    id: 'glass',
    geometry: {
      type: 'roundedBox',
      width: W,
      height: GLASS_T,
      depth: DEPTH,
      radius: 0.0028,
      segments: 4,
    },
    material: 'top',
    transform: { position: [0, BODY_H + GLASS_T / 2, 0] },
  },
  ...ZONES.flatMap(zoneParts),
  plane('slider', [0.16, 0.012, 0.006], 'metal', {
    at: [0, TOP + 0.0004, DEPTH / 2 - 0.035],
    parent: 'glass',
    transform: { rotation: [-90, 0, 0] },
    minLod: 1,
  }),
  plane('sliderGlow', [0.15, 0.006, 0.003], 'accent', {
    at: [0, TOP + 0.0007, DEPTH / 2 - 0.035],
    parent: 'glass',
    transform: { rotation: [-90, 0, 0] },
  }),
  part(
    'powerKey',
    { type: 'ring', innerRadius: 0.007, outerRadius: 0.009, segments: 32 },
    'accent',
    {
      parent: 'glass',
      transform: {
        position: [{ param: 'width', scale: 0.5, offset: -0.05 }, TOP + 0.0007, DEPTH / 2 - 0.035],
        rotation: [-90, 0, 0],
      },
    },
  ),
  halo('sliderHalo', [0.2, 0.04], {
    at: [0, TOP + 0.001, DEPTH / 2 - 0.035],
    parent: 'glass',
    transform: { rotation: [-90, 0, 0] },
    minLod: 1,
  }),
];

const CHANNELS: ModelSpecChannel[] = [
  ...ZONES.flatMap(zoneChannels),
  ramp('zoneLightLit', ['zoneLight', 'emissive'], ['level', [0, 1], [0, 0.4]]),
  look('zoneLightOffline', ['zoneLight', 'emissive'], ['online', { false: 0 }], 450),
  pulse('zone1Simmer', ['zone1', 'emissive'], ['phase', { cooking: 1.4 }], [3, 0.2]),
  ...glow('slider', 'sliderGlow', ['power', { true: 1, false: 0 }, { true: 1, false: 0 }]),
  ...glow('sliderHalo', 'sliderHalo', ['power', { true: 0.4, false: 0 }, { true: 0.6, false: 0 }]),
  ...glow('powerKey', 'powerKey', ['online', { true: 1, false: 0 }, { true: 0.8, false: 0 }]),
  look('powerKeyTint', ['powerKey', 'colour'], ['power', { true: HEAT, false: PRIMARY }], 250),
  ...offline('sliderGlow'),
  ...offline('sliderHalo'),
  look('steamShow', ['steam', 'opacity'], ['phase', { cooking: 0.35, idle: 0, residual: 0 }], 900),
];

export const INDUCTION_HOB_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.hob.induction',
  version: '1.0.0',
  title: 'Induction hob',
  category: 'kitchen',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  framing: { tile: FRAME, card: FRAME, hero: { ...FRAME, padding: 0.12 } },
  shots: [
    {
      id: 'cooking',
      when: {
        anyOf: [
          { allOf: [{ signal: 'phase', op: 'eq', value: 'cooking' }] },
          {
            allOf: [
              { signal: 'power', op: 'eq', value: true },
              { signal: 'level', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'zone1',
      zoom: 1.4,
      yaw: 22,
      pitch: 42,
      easeMs: 900,
      loopS: 3,
      symmetry: 360,
      stillAt: 0.75,
    },
  ],
  meta: {
    names: {
      display: 'Induction hob',
      synonyms: ['hob', 'cooktop', 'induction cooktop', 'stove top', 'induction stove'],
    },
    sizeClass: 'medium',
    variants: ['black', 'framed'],
  },
  params: { width: { min: 0.5, max: 0.9, default: WIDTH, unit: 'm' } },
  materials: {
    top: { finish: 'satin-black', roughness: 0.08, clearcoat: 1 },
    body: { finish: 'graphite' },
    metal: { finish: 'brushed-aluminium', roughness: 0.45 },
    accent: { ...GLOW, color: HEAT },
  },
  ...finishSet(
    {
      black: {},
      framed: { body: { finish: 'brushed-aluminium' } },
      white: { top: { finish: 'matte-white', roughness: 0.1, clearcoat: 1 } },
    },
    'black',
  ),
  parts: PARTS,
  anchors: [
    {
      kind: 'effect',
      id: 'steam',
      parent: 'glass',
      position: [-WIDTH * 0.25, TOP + 0.03, 0.1],
      effect: 'steam',
      size: 0.2,
    },
    {
      kind: 'emitter',
      id: 'zoneLight',
      parent: 'glass',
      position: [-WIDTH * 0.25, TOP + 0.01, 0.1],
      color: HEAT,
      intensity: 0.3,
      radius: 0.15,
    },
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'desk'),
  ],
  channels: CHANNELS,
  states: {
    off: { power: false, level: 0, phase: 'idle', online: true },
    low: { power: true, level: 0.3, phase: 'cooking', online: true },
    high: { power: true, level: 0.9, phase: 'cooking', online: true },
    residual: { power: false, level: 0, phase: 'residual', online: true },
    offline: { online: false },
  },
};

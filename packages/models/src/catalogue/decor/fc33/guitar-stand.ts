import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, cyl, decorItem, finishesOf, piece, rodBetween, woodOf } from '../fc30/kit';

const LEAN = -10;
const FRONT = 0.046;
const APEX = [0, 0.52, -0.02] as const;

const BODY_PATH = [
  { op: 'move', x: 0, y: 0.25 },
  { op: 'cubic', c1x: 0.08, c1y: 0.25, c2x: 0.14, c2y: 0.21, x: 0.14, y: 0.14 },
  { op: 'cubic', c1x: 0.14, c1y: 0.08, c2x: 0.115, c2y: 0.04, x: 0.115, y: 0 },
  { op: 'cubic', c1x: 0.115, c1y: -0.04, c2x: 0.19, c2y: -0.06, x: 0.19, y: -0.12 },
  { op: 'cubic', c1x: 0.19, c1y: -0.21, c2x: 0.1, c2y: -0.25, x: 0, y: -0.25 },
  { op: 'cubic', c1x: -0.1, c1y: -0.25, c2x: -0.19, c2y: -0.21, x: -0.19, y: -0.12 },
  { op: 'cubic', c1x: -0.19, c1y: -0.06, c2x: -0.115, c2y: -0.04, x: -0.115, y: 0 },
  { op: 'cubic', c1x: -0.115, c1y: 0.04, c2x: -0.14, c2y: 0.08, x: -0.14, y: 0.14 },
  { op: 'cubic', c1x: -0.14, c1y: 0.21, c2x: -0.08, c2y: 0.25, x: 0, y: 0.25 },
] as const;

function guitar(): ModelSpecPart[] {
  const child = { parent: 'body' } as const;
  return [
    piece(
      'body',
      'body',
      { type: 'extrude', path: BODY_PATH.map((step) => ({ ...step })), depth: 0.08, bevel: 0.006 },
      { at: [0, 0.766, -0.023], turn: [LEAN, 0, 0] },
    ),
    block('neck', 'neck', [0.045, 0.46, 0.03], {
      ...child,
      at: [0, 0.41, 0.028],
      round: 0.008,
      segments: 3,
    }),
    block('fretboard', 'neck', [0.042, 0.42, 0.006], {
      ...child,
      at: [0, 0.43, 0.0455],
      round: 0.002,
      segments: 3,
    }),
    block('headstock', 'neck', [0.062, 0.13, 0.02], {
      ...child,
      at: [0, 0.7, 0.03],
      round: 0.008,
      segments: 3,
    }),
    cyl(
      'soundhole',
      'stand',
      { height: 0.004, top: 0.047, bevel: 0.001, segments: 48 },
      { ...child, at: [0, 0.04, FRONT + 0.0005], turn: [90, 0, 0] },
    ),
    piece(
      'rosette',
      'accent',
      { type: 'ring', innerRadius: 0.048, outerRadius: 0.056, segments: 48 },
      { ...child, at: [0, 0.04, FRONT + 0.0025], minLod: 1 },
    ),
    block('bridge', 'neck', [0.12, 0.014, 0.012], {
      ...child,
      at: [0, -0.14, FRONT + 0.003],
      round: 0.003,
      segments: 3,
    }),
  ];
}

function details(): ModelSpecPart[] {
  const tuners = Array.from({ length: 6 }, (_, index) => {
    const side = index < 3 ? -1 : 1;
    return piece(
      `tuner${String(index + 1)}`,
      'accent',
      { type: 'sphere', radius: 0.007, segments: 16 },
      { parent: 'body', at: [side * 0.039, 0.665 + (index % 3) * 0.035, 0.03], minLod: 1 },
    );
  });
  const strings = Array.from({ length: 6 }, (_, index) =>
    cyl(
      `string${String(index + 1)}`,
      'accent',
      { height: 0.78, top: 0.0008, bevel: 0, segments: 8 },
      { parent: 'body', at: [(index - 2.5) * 0.009, 0.245, FRONT + 0.0125], minLod: 2 },
    ),
  );
  return [...tuners, ...strings];
}

function stand(): ModelSpecPart[] {
  const bar = 0.01;
  return [
    rodBetween(
      'legLeft',
      'stand',
      { from: [-0.02, APEX[1], APEX[2]], to: [-0.26, 0, 0.12], radius: bar },
      { contact: true },
    ),
    rodBetween(
      'legRight',
      'stand',
      { from: [0.02, APEX[1], APEX[2]], to: [0.26, 0, 0.12], radius: bar },
      { contact: true },
    ),
    rodBetween(
      'legBack',
      'stand',
      { from: APEX, to: [0, 0, -0.3], radius: bar },
      { contact: true },
    ),
    rodBetween('post', 'stand', { from: APEX, to: [0, 1.172, -0.095], radius: 0.009 }),
    rodBetween('armLeft', 'stand', {
      from: [-0.08, 0.502, 0.02],
      to: [-0.01, APEX[1], APEX[2]],
      radius: 0.007,
    }),
    rodBetween('armRight', 'stand', {
      from: [0.08, 0.502, 0.02],
      to: [0.01, APEX[1], APEX[2]],
      radius: 0.007,
    }),
    cyl(
      'padLow',
      'stand',
      { height: 0.17, top: 0.018, bevel: 0.006, segments: 24 },
      { at: [0, 0.502, 0.02], turn: [0, 0, 90] },
    ),
    cyl(
      'padHigh',
      'stand',
      { height: 0.12, top: 0.014, bevel: 0.005, segments: 24 },
      { at: [0, 1.172, -0.095], turn: [0, 0, 90] },
    ),
  ];
}

export const GUITAR_STAND_MODEL: ModelSpec = decorItem({
  id: 'cat.decor.guitar-stand',
  title: 'Guitar on stand',
  footprint: { width: 0.52, depth: 0.45, height: 1.52 },
  meta: {
    names: {
      display: 'Guitar on stand',
      synonyms: [
        'acoustic guitar',
        'guitar',
        'guitar stand',
        'guitar and stand',
        'instrument stand',
      ],
    },
    sizeClass: 'tall',
  },
  materials: {
    body: { finish: 'ash', clearcoat: 0.5 },
    neck: woodOf('walnut'),
    stand: { finish: 'satin-black' },
    accent: { finish: 'chrome' },
  },
  finish: finishesOf(
    {
      natural: {},
      sunburst: { body: { color: '#B5651D', roughness: 0.35, clearcoat: 0.6 } },
      black: { body: { finish: 'satin-black', clearcoat: 0.6 } },
      walnut: { body: woodOf('walnut', { clearcoat: 0.5 }), neck: woodOf('oak') },
    },
    'natural',
  ),
  mount: 'floor',
  pitch: 12,
  parts: [...stand(), ...guitar(), ...details()],
});

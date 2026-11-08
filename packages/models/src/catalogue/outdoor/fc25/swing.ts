import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueModel, rod, whileOn } from './kit';

const SPREAD = 0.35;
const LEAN = 8.3;
const BEAM = 0.11;

interface Seat {
  readonly name: 'A' | 'B';
  readonly side: -1 | 1;
  readonly limit: number;
  readonly speed: number;
}

const SEATS: readonly Seat[] = [
  { name: 'A', side: -1, limit: 22, speed: 11 },
  { name: 'B', side: 1, limit: 16, speed: 8 },
];

function frame(): ModelSpecPart[] {
  const legs = ([-1, 1] as const).flatMap((end) =>
    ([-1, 1] as const).map((face) =>
      block(
        `leg${end < 0 ? 'Left' : 'Right'}${face < 0 ? 'Back' : 'Front'}`,
        'frame',
        [0.09, by('height', 1, -0.01), 0.09],
        {
          round: 0.02,
          segments: 3,
          at: [by('width', end * 0.5, end * 0.05), by('height', 0.5, -0.03), (face * SPREAD) / 2],
          turn: [-face * LEAN, 0, 0],
          contact: true,
        },
      ),
    ),
  );
  return [
    block('beam', 'frame', [by('width', 1, 0.3), BEAM, BEAM], {
      round: 0.025,
      segments: 3,
      at: [0, by('height', 1, -BEAM / 2), 0],
    }),
    ...legs,
  ];
}

function hanging(seat: Seat): ModelSpecPart[] {
  const parent = `pivot${seat.name}`;
  const chain = by('height', 1, -0.59);
  const chains = ([-1, 1] as const).map((side) =>
    rod(
      `chain${seat.name}${side < 0 ? 'Left' : 'Right'}`,
      'accent',
      { height: chain, top: 0.02, bevel: 0.006, segments: 12 },
      { at: [side * 0.2, by('height', -0.5, 0.295), 0], parent },
    ),
  );
  return [
    block(parent, 'accent', [0.5, 0.06, 0.06], {
      round: 0.02,
      segments: 3,
      at: [by('width', seat.side * 0.22), by('height', 1, -0.14), 0],
    }),
    ...chains,
    block(`seat${seat.name}`, 'seat', [0.5, 0.05, 0.2], {
      round: 0.022,
      segments: 3,
      at: [0, by('height', -1, 0.565), 0],
      parent,
    }),
  ];
}

function swingChannel(seat: Seat): ModelSpecChannel {
  return {
    id: `swing${seat.name}`,
    target: `pivot${seat.name}`,
    property: 'rotate',
    axis: 'x',
    source: 'motion',
    map: { type: 'enum', table: { true: 1 } },
    motion: { type: 'oscillate', limits: [-seat.limit, seat.limit], speed: seat.speed },
    reduced: 'hold',
  };
}

export const SWING_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.swing',
  title: 'Garden swing',
  category: 'outdoor',
  footprint: { width: 2.7, depth: 0.7841, height: 2.419 },
  size: {
    width: { param: 'width', extra: 0.3, resizes: true },
    depth: { param: 'height', scale: 0.1444, extra: 0.4375, resizes: false },
    height: { param: 'height', scale: 0.9948, extra: 0.0315, resizes: true },
  },
  view: { yaw: 25, pitch: 10, fov: 28, padding: 0.08 },
  meta: {
    names: {
      display: 'Garden swing',
      synonyms: ['swing', 'swing set', 'garden swing', 'playground swing', 'a-frame swing'],
    },
    sizeClass: 'large',
  },
  params: {
    width: { min: 1.6, max: 4, default: 2.4, unit: 'm' },
    height: { min: 1.9, max: 3, default: 2.4, unit: 'm' },
  },
  materials: {
    frame: tokenMaterial('oak'),
    seat: colorMaterial('#2E3338', { roughness: 0.9 }),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { frame: { finish: 'walnut' } },
      ash: { frame: { finish: 'ash' } },
      charcoal: { frame: { finish: 'graphite' } },
    },
    'oak',
  ),
  parts: [...frame(), ...SEATS.flatMap(hanging)],
  channels: SEATS.map(swingChannel),
  shots: [
    whileOn({
      id: 'swinging',
      signal: 'motion',
      focus: 'seatA',
      zoom: 1,
      yaw: -14,
      pitch: 6,
      loopS: 8,
      stillAt: 2,
    }),
  ],
  states: { rest: { motion: false }, swinging: { motion: true } },
});

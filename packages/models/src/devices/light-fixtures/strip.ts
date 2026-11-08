import type { ModelSpec } from '@smarteverything/domain';
import { enumChannel } from '@smarteverything/domain';
import { finishSet } from '../../helpers/finishes';
import { box, part } from '../../helpers/geometry';
import { extrudePath, pathBuilder, type PathCommand } from '../../helpers/path';
import { emitter, glowChannels, glowShot, lightModel } from './kit';

const HALF_RUN = 0.28;
const SHIFT = 0.04;
const AMPLITUDE = 0.06;
const PERIOD = 0.37;
const SAMPLES = 28;
const BAND_T = 0.0024;
const LEDS = 20;
const UNLIT = '#3E4148';
const SHADED = 0.97;
const DECAY = { type: 'pose', easeMs: 450 } as const;
const VIEW = { yaw: 30, pitch: 35, fov: 28, padding: 0.14, focus: 'band' } as const;

function centre(t: number): readonly [number, number] {
  const x = -HALF_RUN + 2 * HALF_RUN * t;
  return [x + SHIFT, AMPLITUDE * Math.sin((2 * Math.PI * x) / PERIOD)];
}

function slope(t: number): number {
  const x = -HALF_RUN + 2 * HALF_RUN * t;
  return ((AMPLITUDE * 2 * Math.PI) / PERIOD) * Math.cos((2 * Math.PI * x) / PERIOD);
}

function edge(t: number, offset: number): readonly [number, number] {
  const [x, y] = centre(t);
  const s = slope(t);
  const length = Math.hypot(1, s);
  return [x - (offset * s) / length, y + offset / length];
}

function bandPath(width: number): readonly PathCommand[] {
  const steps = Array.from({ length: SAMPLES + 1 }, (_, index) => index / SAMPLES);
  const upper = steps.map((t) => edge(t, width / 2));
  const lower = steps.map((t) => edge(t, -width / 2)).reverse();
  const [start, ...rest] = [...upper, ...lower];
  const origin = start ?? [0, 0];
  return rest
    .reduce((path, [x, y]) => path.line(x, y), pathBuilder(origin[0], origin[1]))
    .close()
    .build();
}

function leds(): ModelSpec['parts'] {
  return Array.from({ length: LEDS }, (_, index) => {
    const t = (index + 0.5) / LEDS;
    const [x, y] = centre(t);
    const chip = {
      type: 'roundedPlane',
      width: 0.0052,
      height: 0.0052,
      radius: 0.0008,
      segments: 3,
    } as const;
    return part(`led${String(index + 1)}`, chip, 'accent', {
      transform: {
        position: [x, BAND_T + 0.0003, -y],
        rotation: [-90, 0, (Math.atan(slope(t)) * 180) / Math.PI],
      },
      minLod: 1,
    });
  });
}

const [START_X, START_Y] = centre(0);

const PARTS: ModelSpec['parts'] = [
  part('band', extrudePath(bandPath(0.015), BAND_T, 0.0004), 'body', {
    transform: { position: [0, BAND_T / 2, 0], rotation: [-90, 0, 0] },
  }),
  part('lane', extrudePath(bandPath(0.0105), 0.0012), 'glass', {
    transform: { position: [0, BAND_T + 0.0012, 0], rotation: [-90, 0, 0] },
  }),
  ...leds(),
  box('controller', [0.034, 0.013, 0.022, 0.0026], 'trim', {
    at: [START_X - 0.024, 0.0065, -START_Y],
    transform: { rotation: [0, 18, 0] },
    contact: true,
  }),
  part('button', { type: 'ring', innerRadius: 0.0022, outerRadius: 0.0042, segments: 32 }, 'body', {
    parent: 'controller',
    transform: { position: [0.004, 0.0068, 0], rotation: [-90, 0, 0] },
    minLod: 1,
  }),
  part(
    'cable',
    {
      type: 'tube',
      points: [
        [START_X - 0.041, 0.004, -START_Y + 0.004],
        [START_X - 0.07, 0.003, -START_Y + 0.03],
        [START_X - 0.06, 0.003, -START_Y + 0.085],
      ],
      radius: 0.0022,
      segments: 12,
    },
    'trim',
  ),
  box('plug', [0.026, 0.016, 0.034, 0.0032], 'trim', {
    at: [START_X - 0.058, 0.008, -START_Y + 0.1],
    contact: true,
  }),
];

export const LIGHT_STRIP_MODEL: ModelSpec = lightModel({
  id: 'dev.light.strip',
  title: 'LED light strip',
  footprint: { width: 0.7, depth: 0.2, height: 0.016 },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, pitch: 32, padding: 0.16 } },
  shots: [glowShot({ focus: 'lane', zoom: 1.05, yaw: 24, pitch: 40 })],
  meta: {
    names: {
      display: 'LED light strip',
      synonyms: ['light strip', 'LED strip', 'LED tape', 'strip light', 'RGB strip'],
    },
    sizeClass: 'small',
    variants: ['white', 'black'],
  },
  materials: {
    body: { finish: 'matte-white' },
    trim: { finish: 'satin-black' },
    glass: { finish: 'frosted-glass', opacity: 0.72 },
    accent: { color: '#E8C766', roughness: 0.35, clearcoat: 0.6 },
  },
  ...finishSet({ white: {}, black: { body: { finish: 'satin-black' } } }, 'white'),
  parts: PARTS,
  anchors: [
    emitter({
      id: 'light',
      parent: 'lane',
      position: [SHIFT, 0, 0.01],
      radius: 1.6,
      intensity: 0.8,
    }),
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [SHIFT, 0.03, 0] },
    { kind: 'hit', id: 'body', position: [0, 0.008, 0], size: [0.7, 0.016, 0.2] },
  ],
  channels: [
    ...glowChannels('lane', [0.1, 2.4]),
    enumChannel('laneUnlit', ['lane', 'colour'], ['power', { false: UNLIT }], DECAY),
    enumChannel('laneDead', ['lane', 'colour'], ['online', { false: UNLIT }], DECAY),
    enumChannel('laneShade', ['lane', 'opacity'], ['power', { false: SHADED }], DECAY),
    enumChannel('laneGone', ['lane', 'opacity'], ['online', { false: SHADED }], DECAY),
    ...glowChannels('light', [0.35, 1]),
  ],
});

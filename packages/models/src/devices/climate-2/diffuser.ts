import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, lathe, part } from '../../helpers/geometry';
import { ACCENT, WARNING, ball, house, look, puck, ramp, shot } from '../energy/kit';
import { floorAnchors, powerOff } from '../climate/kit';
import { RUNNING, lit } from './kit';

const RADIUS = 0.076;
const SEAM_Y = 0.058;
const HEIGHT = 0.142;
const MOOD = '#F2B45E';

export const ULTRASONIC_DIFFUSER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.diffuser.ultrasonic',
  version: '1.0.0',
  title: 'Scent diffuser',
  category: 'climate',
  family: 'diffuser',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('cover', 28, 18),
  shots: [
    shot('scenting', RUNNING, 'cover', { zoom: 1.15, yaw: 20, pitch: 20, loopS: 4, stillAt: 2 }),
  ],
  meta: {
    names: {
      display: 'Scent diffuser',
      synonyms: [
        'aroma diffuser',
        'essential oil diffuser',
        'fragrance diffuser',
        'ultrasonic diffuser',
        'diffuser',
      ],
    },
    sizeClass: 'small',
    variants: ['oak', 'walnut', 'white'],
  },
  materials: {
    body: { finish: 'oak', clearcoat: 0.25 },
    cover: { color: '#6A7178', roughness: 0.4, clearcoat: 0.6, opacity: 0.88 },
    trim: { finish: 'graphite' },
    accent: { ...ACCENT, color: MOOD },
  },
  finishes: {
    oak: {},
    walnut: { body: { finish: 'walnut', clearcoat: 0.25 } },
    white: { body: { finish: 'ceramic', clearcoat: 0.5 }, cover: { color: '#D3D9DE' } },
  },
  defaultFinish: 'oak',
  parts: [
    part(
      'base',
      lathe({
        profile: [
          [0.001, 0],
          [0.052, 0],
          [0.062, 0.006],
          [0.071, 0.022],
          [RADIUS, 0.044],
          [0.075, SEAM_Y],
          [0.001, SEAM_Y],
        ],
        segments: 56,
      }),
      'body',
      { contact: true },
    ),
    part('seam', { type: 'torus', radius: 0.0752, tube: 0.0012, segments: 56 }, 'trim', {
      transform: { position: [0, SEAM_Y, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    ball('glow', 0.058, 'accent', {
      at: [0, SEAM_Y + 0.024, 0],
      transform: { scale: [1, 0.72, 1] },
      segments: 24,
    }),
    part(
      'cover',
      lathe({
        profile: [
          [0.074, SEAM_Y],
          [0.073, SEAM_Y + 0.02],
          [0.066, SEAM_Y + 0.048],
          [0.05, SEAM_Y + 0.07],
          [0.028, HEIGHT - 0.004],
          [0.015, HEIGHT],
          [0.013, HEIGHT - 0.004],
        ],
        segments: 56,
      }),
      'cover',
    ),
    puck('outlet', [0.012, 0.004, 0.0015], 'trim', { at: [0, HEIGHT - 0.003, 0] }),
    puck('button', [0.009, 0.004, 0.0015], 'trim', {
      at: [0, 0.03, 0.0735],
      transform: { rotation: [72, 0, 0] },
      minLod: 1,
      segments: 24,
    }),
    box('led', [0.012, 0.003, 0.003, 0.0012], 'accent', {
      at: [0, 0.042, 0.0745],
      transform: { rotation: [-18, 0, 0] },
      minLod: 1,
      segments: 3,
    }),
  ],
  anchors: [
    ...floorAnchors([RADIUS * 2, HEIGHT, RADIUS * 2]),
    { kind: 'effect', id: 'scent', position: [0, HEIGHT + 0.004, 0], effect: 'mist', size: 0.09 },
    {
      kind: 'emitter',
      id: 'moodLight',
      position: [0, SEAM_Y + 0.03, 0],
      color: MOOD,
      intensity: 0.45,
      radius: 0.2,
    },
  ],
  channels: [
    {
      id: 'glowColour',
      target: 'glow',
      property: 'colour',
      source: 'colour',
      map: { type: 'colour', from: 'signal' },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    look('glowShow', ['glow', 'opacity'], ['lamp', { true: 0.85, false: 0 }]),
    look('glowLit', ['glow', 'emissive'], ['lamp', { true: 1.3, false: 0 }]),
    look('glowHide', ['glow', 'opacity'], ['power', { false: 0 }], 450),
    look('glowGone', ['glow', 'opacity'], ['online', { false: 0 }], 450),
    ...emitterChannels('glow'),
    {
      id: 'moodColour',
      target: 'moodLight',
      property: 'colour',
      source: 'colour',
      map: { type: 'colour', from: 'signal' },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    ...emitterChannels('moodLight', ['lamp', { true: 0.8, false: 0 }]),
    ramp('scentShow', ['scent', 'opacity'], ['speed', [0, 1], [0, 0.5]], 600),
    ramp('scentHeight', ['scent', 'scale', 'y'], ['speed', [0, 1], [0.45, 1]], 600),
    ...powerOff('scent'),
    look('scentDry', ['scent', 'opacity'], ['waterLow', { true: 0 }], 450),
    ...lit('led', [1, 0.9]),
    look('ledLow', ['led', 'colour'], ['waterLow', { true: WARNING }], 250),
  ],
  states: {
    off: { power: false, online: true, speed: 0, lamp: false },
    on: { power: true, online: true, speed: 0.5, lamp: false },
    strong: { power: true, online: true, speed: 1, lamp: false },
    moodLight: { power: true, online: true, speed: 0.5, lamp: true, colour: '#F2A65E' },
    refillLow: {
      power: true,
      online: true,
      speed: 0,
      lamp: false,
      waterLow: true,
      waterLevel: 0.05,
    },
    fault: { power: true, online: true, fault: true, speed: 0, lamp: false },
    offline: { online: false },
  },
};

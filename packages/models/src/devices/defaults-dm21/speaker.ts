import type { ModelSpec } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import { ledChannels, PLAY_SHOT_WHEN } from '../audio/channels';
import { ACCENT, PRIMARY, anchorsOf, ball, house, look, puck, shot } from '../energy/kit';
import { turn } from './kit';

const RADIUS = 0.05;
const FOOT = 0.008;
const BODY = 0.142;
const TOP = FOOT + BODY;
const CAP = 0.012;
const HEIGHT = TOP + CAP;
const RING_R = 0.0365;
const LISTEN = '#7FA8FF';
const MUTED = '#F2564E';

const MICS = [45, 135, 225, 315].map((deg, index) =>
  ball(`mic${String(index)}`, 0.0008, 'trim', {
    at: [Math.cos((deg * Math.PI) / 180) * 0.026, CAP / 2, Math.sin((deg * Math.PI) / 180) * 0.026],
    parent: 'cap',
    segments: 8,
    minLod: 2,
  }),
);

export const SMART_SPEAKER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.speaker.smart',
  version: '1.0.0',
  title: 'Smart speaker',
  category: 'audio',
  family: 'speaker',
  footprint: { width: RADIUS * 2, depth: RADIUS * 2, height: HEIGHT },
  framing: house('body', 30, 18),
  shots: [shot('play', PLAY_SHOT_WHEN, 'cap', { zoom: 1.45, yaw: 22, pitch: 38, loopS: 2 })],
  meta: {
    names: {
      display: 'Smart speaker',
      synonyms: ['voice assistant speaker', 'assistant speaker', 'wifi speaker', 'home speaker'],
    },
    sizeClass: 'small',
    variants: ['chalk', 'charcoal', 'sand'],
  },
  materials: {
    fabric: { finish: 'warm-white', roughness: 0.92, sheen: 0.7, pattern: 'knit' },
    cap: { finish: 'matte-white', clearcoat: 0.4 },
    trim: { finish: 'graphite' },
    accent: ACCENT,
  },
  finishes: {
    chalk: {},
    charcoal: {
      fabric: { finish: 'graphite', roughness: 0.92, sheen: 0.8, pattern: 'knit' },
      cap: { finish: 'satin-black', clearcoat: 0.6 },
      trim: { finish: 'brushed-aluminium' },
    },
    sand: { fabric: { color: '#CDBBA1', roughness: 0.92, sheen: 0.7, pattern: 'knit' } },
  },
  defaultFinish: 'chalk',
  parts: [
    puck('foot', [RADIUS - 0.007, FOOT, 0.002], 'trim', { at: [0, FOOT / 2, 0], contact: true }),
    part(
      'body',
      {
        type: 'cylinder',
        height: BODY,
        topRadius: RADIUS - 0.0008,
        bottomRadius: RADIUS,
        bevel: 0.009,
        segments: 64,
      },
      'fabric',
      { transform: { position: [0, FOOT + BODY / 2, 0] } },
    ),
    part('seam', { type: 'torus', radius: RADIUS - 0.0012, tube: 0.0011, segments: 64 }, 'trim', {
      transform: { position: [0, TOP, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('cap', [RADIUS - 0.0016, CAP, 0.005], 'cap', { at: [0, TOP + CAP / 2, 0], segments: 64 }),
    part(
      'ringBed',
      { type: 'ring', innerRadius: RING_R - 0.005, outerRadius: RING_R + 0.005, segments: 64 },
      'trim',
      { parent: 'cap', transform: { position: [0, CAP / 2 + 0.0003, 0], rotation: [-90, 0, 0] } },
    ),
    part(
      'ring',
      { type: 'ring', innerRadius: RING_R - 0.0032, outerRadius: RING_R + 0.0032, segments: 64 },
      'accent',
      { parent: 'cap', transform: { position: [0, CAP / 2 + 0.0006, 0], rotation: [-90, 0, 0] } },
    ),
    ball('orbit', 0.0008, 'cap', { at: [0, CAP / 2 + 0.0008, 0], parent: 'cap', segments: 8 }),
    ball('glint', 0.0036, 'accent', {
      at: [RING_R, 0, 0],
      parent: 'orbit',
      transform: { scale: [1, 0.4, 1] },
      segments: 12,
      minLod: 1,
    }),
    box('volumeDown', [0.0064, 0.0008, 0.0014, 0.0004], 'trim', {
      at: [-0.014, CAP / 2 + 0.0004, 0],
      parent: 'cap',
      segments: 3,
      minLod: 1,
    }),
    box('volumeUp', [0.0064, 0.0008, 0.0014, 0.0004], 'trim', {
      at: [0.014, CAP / 2 + 0.0004, 0],
      parent: 'cap',
      segments: 3,
      minLod: 1,
    }),
    box('volumeUpStem', [0.0014, 0.0008, 0.0064, 0.0004], 'trim', {
      at: [0.014, CAP / 2 + 0.0004, 0],
      parent: 'cap',
      segments: 3,
      minLod: 2,
    }),
    ...MICS,
    puck('jack', [0.0035, 0.002, 0.0006], 'trim', {
      at: [0, FOOT + 0.014, -RADIUS + 0.0004],
      transform: { rotation: [90, 0, 0] },
      segments: 16,
      minLod: 2,
    }),
  ],
  anchors: [
    ...anchorsOf([RADIUS * 2, HEIGHT, RADIUS * 2], 'floor'),
    {
      kind: 'emitter',
      id: 'halo',
      position: [0, HEIGHT + 0.01, 0],
      color: PRIMARY,
      intensity: 0.35,
      radius: 0.12,
    },
  ],
  channels: [
    ...ledChannels('ring'),
    look('ringDark', ['ring', 'opacity'], ['power', { false: 0 }], 450),
    look('ringListen', ['ring', 'colour'], ['mode', { listening: LISTEN, muted: MUTED }]),
    look('ringHeard', ['ring', 'emissive'], ['mode', { listening: 1.4, muted: 0.9 }]),
    look('glintShow', ['glint', 'opacity'], ['playing', { true: 1, false: 0 }]),
    look('glintLit', ['glint', 'emissive'], ['playing', { true: 1.6, false: 0 }]),
    look('glintOffline', ['glint', 'opacity'], ['online', { false: 0 }], 450),
    turn('glintOrbit', ['orbit', 'y'], ['playing', { true: 0.5 }]),
    ...emitterChannels('halo', ['playing', { true: 0.9, false: 0.25 }]),
  ],
  states: {
    off: { power: false, online: true, playing: false },
    idle: { power: true, online: true, playing: false },
    listening: { power: true, online: true, playing: false, mode: 'listening' },
    playing: { power: true, online: true, playing: true, volume: 0.5 },
    muted: { power: true, online: true, playing: false, mode: 'muted' },
    fault: { power: true, online: true, fault: true },
    offline: { online: false },
  },
};

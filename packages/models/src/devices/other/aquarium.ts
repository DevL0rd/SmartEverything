import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  ACCENT,
  anchorsOf,
  ball,
  house,
  leaf,
  look,
  shot,
  status,
  sway,
  whenAll,
} from '../energy/kit';

const WIDTH = 0.82;
const DEPTH = 0.42;
const HEIGHT = 0.86;
const STAND_H = 0.42;
const TANK_H = 0.4;
const TANK_Y = STAND_H + TANK_H / 2;
const LAMP = '#FFE2B0';

const LIVE = whenAll(leaf('power', 'eq', true));

const FISH = [
  { id: 'fishA', at: [-0.12, TANK_Y + 0.04, 0.05], colour: '#F29A4E', reach: 0.14, pace: 0.035 },
  { id: 'fishB', at: [0.14, TANK_Y - 0.03, -0.04], colour: '#5ED3CF', reach: 0.1, pace: 0.025 },
] as const;

const FISH_PARTS: ModelSpecPart[] = FISH.flatMap((fish) => [
  part(fish.id, { type: 'capsule', radius: 0.013, length: 0.036, segments: 12 }, 'accent', {
    transform: { position: [fish.at[0], fish.at[1], fish.at[2]], rotation: [0, 0, 90] },
    minLod: 1,
  }),
  box(fish.id + 'Tail', [0.004, 0.026, 0.01, 0.0015], 'accent', {
    at: [0, -0.028, 0],
    parent: fish.id,
    segments: 3,
    minLod: 1,
  }),
]);

const FISH_CHANNELS: ModelSpecChannel[] = FISH.flatMap((fish) => [
  look(fish.id + 'Colour', [fish.id, 'colour'], ['power', { true: fish.colour }]),
  look(fish.id + 'Show', [fish.id, 'opacity'], ['power', { true: 1, false: 0 }]),
  look(fish.id + 'Lit', [fish.id, 'emissive'], ['power', { true: 0.5, false: 0 }]),
  look(fish.id + 'Offline', [fish.id, 'opacity'], ['online', { false: 0 }], 450),
  sway(
    fish.id + 'Swim',
    [fish.id, 'x'],
    ['power', { true: 1 }],
    [[-fish.reach, fish.reach], fish.pace],
  ),
  look(fish.id + 'TailShow', [fish.id + 'Tail', 'opacity'], ['power', { true: 1, false: 0 }]),
]);

export const AQUARIUM_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.aquarium',
  version: '1.0.0',
  title: 'Aquarium',
  category: 'pet',
  family: 'generic',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: house('tank', 26, 12),
  shots: [shot('swimming', LIVE, 'fishA', { zoom: 1.6, yaw: 12, pitch: 6, loopS: 8, stillAt: 4 })],
  meta: {
    names: {
      display: 'Aquarium',
      synonyms: ['fish tank', 'tank', 'terrarium', 'fish aquarium'],
    },
    sizeClass: 'large',
    variants: ['black', 'oak'],
  },
  materials: {
    frame: { finish: 'satin-black' },
    water: { color: '#9CD2E0', roughness: 0.05, opacity: 0.32 },
    deco: { color: '#CDB48A', roughness: 0.9 },
    accent: ACCENT,
  },
  finishes: {
    black: {},
    oak: { frame: { finish: 'oak' } },
  },
  defaultFinish: 'black',
  parts: [
    box('stand', [WIDTH * 0.96, STAND_H, DEPTH * 0.94, 0.012], 'frame', {
      at: [0, STAND_H / 2, 0],
      contact: true,
    }),
    box('tank', [WIDTH, TANK_H, DEPTH, 0.01], 'water', { at: [0, TANK_Y, 0] }),
    box('sand', [WIDTH * 0.95, 0.04, DEPTH * 0.93, 0.012], 'deco', {
      at: [0, STAND_H + 0.022, 0],
      minLod: 1,
    }),
    ball('rockLeft', 0.052, 'deco', {
      at: [-0.22, STAND_H + 0.05, -0.06],
      segments: 16,
      minLod: 1,
    }),
    ball('rockRight', 0.04, 'deco', { at: [0.2, STAND_H + 0.04, 0.07], segments: 16, minLod: 1 }),
    box('hood', [WIDTH, 0.052, DEPTH, 0.012], 'frame', { at: [0, STAND_H + TANK_H + 0.026, 0] }),
    box('lamp', [WIDTH * 0.84, 0.007, 0.06, 0.0028], 'accent', {
      at: [0, STAND_H + TANK_H - 0.0005, 0.04],
      minLod: 1,
    }),
    ...FISH_PARTS,
    box('led', [0.014, 0.006, 0.0016, 0.0026], 'accent', {
      at: [0.34, STAND_H + TANK_H + 0.026, DEPTH / 2 + 0.0006],
      minLod: 1,
    }),
  ],
  anchors: [
    ...anchorsOf([WIDTH, HEIGHT, DEPTH], 'floor'),
    {
      kind: 'emitter',
      id: 'lampLight',
      position: [0, STAND_H + TANK_H - 0.02, 0.04],
      color: LAMP,
      intensity: 0.6,
      radius: 0.5,
    },
    {
      kind: 'effect',
      id: 'bubbles',
      position: [0.3, STAND_H + 0.05, -0.1],
      effect: 'sparkle',
      size: 0.2,
    },
  ],
  channels: [
    look('lampTint', ['lamp', 'colour'], ['lamp', { true: LAMP }]),
    look('lampShow', ['lamp', 'opacity'], ['lamp', { true: 1, false: 0 }]),
    look('lampLit', ['lamp', 'emissive'], ['lamp', { true: 1.2, false: 0 }]),
    look('lampOffline', ['lamp', 'opacity'], ['online', { false: 0 }], 450),
    ...FISH_CHANNELS,
    ...status('led'),
    ...emitterChannels('lampLight', ['lamp', { true: 1, false: 0 }]),
  ],
  states: {
    off: { power: false, online: true, lamp: false },
    day: { power: true, online: true, lamp: true },
    night: { power: true, online: true, lamp: false },
    fault: { power: true, online: true, fault: true, lamp: true },
    offline: { online: false },
  },
};

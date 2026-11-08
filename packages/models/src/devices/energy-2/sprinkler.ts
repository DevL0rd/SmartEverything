import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { box, part } from '../../helpers/geometry';
import {
  WATER,
  anchorsOf,
  house,
  leaf,
  look,
  puck,
  ramp,
  shot,
  spin,
  status,
  whenAll,
} from '../energy/kit';

const REACH = 0.1;
const HEIGHT = 0.16;
const JETS = 3;

const SPRAYING = whenAll(leaf('power', 'eq', true), leaf('speed', 'gt', 0));

const JET_PARTS: ModelSpecPart[] = Array.from({ length: JETS }, (_, index) => {
  const angle = (index * 2 * Math.PI) / JETS;
  const along = (r: number, y: number): [number, number, number] => [
    Math.cos(angle) * r,
    y,
    Math.sin(angle) * r,
  ];
  return part(
    'jet' + String(index),
    {
      type: 'tube',
      points: [
        along(0.016, 0.004),
        along(0.045, 0.03),
        along(0.075, 0.022),
        along(0.092, -0.03),
        along(0.099, -0.125),
      ],
      radius: 0.0036,
      segments: 8,
    },
    'accent',
    { parent: 'head', minLod: 1 },
  );
});

const jetChannels = JET_PARTS.flatMap((jet) => [
  ramp(jet.id + 'Show', [jet.id, 'opacity'], ['speed', [0, 0.02], [0, 0.85]]),
  look(jet.id + 'Offline', [jet.id, 'opacity'], ['online', { false: 0 }], 450),
]);

export const SPRINKLER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.sprinkler',
  version: '1.0.0',
  title: 'Sprinkler',
  category: 'garden',
  family: 'generic',
  footprint: { width: REACH * 2, depth: REACH * 2, height: HEIGHT },
  framing: house('head', 28, 20),
  shots: [
    shot('spraying', SPRAYING, 'head', { zoom: 1.3, yaw: 24, pitch: 22, loopS: 4, symmetry: 120 }),
  ],
  meta: {
    names: {
      display: 'Sprinkler',
      synonyms: [
        'irrigation',
        'lawn sprinkler',
        'rotor sprinkler',
        'pop-up sprinkler',
        'garden watering',
      ],
    },
    sizeClass: 'small',
    variants: ['black', 'graphite'],
  },
  materials: {
    body: { finish: 'satin-black' },
    trim: { finish: 'brushed-aluminium' },
    turf: { color: '#5C8A4C', roughness: 0.95 },
    accent: { color: WATER, roughness: 0.25, opacity: 0 },
  },
  finishes: {
    black: {},
    graphite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'black',
  parts: [
    puck('lawn', [REACH, 0.01, 0.004], 'turf', { at: [0, 0.005, 0], contact: true }),
    puck('housing', [0.044, 0.044, 0.01], 'body', { at: [0, 0.032, 0] }),
    puck('collar', [0.048, 0.008, 0.003], 'trim', { at: [0, 0.058, 0], minLod: 1 }),
    part('glowRing', { type: 'torus', radius: 0.0405, tube: 0.0022, segments: 32 }, 'accent', {
      transform: { position: [0, 0.0625, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('riser', [0.024, 0.044, 0.004], 'trim', { at: [0, 0.04, 0] }),
    puck('head', [0.021, 0.034, 0.006], 'body', {
      at: [0, 0.039, 0],
      parent: 'riser',
    }),
    box('nozzle', [0.012, 0.01, 0.014, 0.003], 'trim', {
      at: [0.016, 0.004, 0],
      parent: 'head',
      minLod: 1,
    }),
    ...JET_PARTS,
  ],
  anchors: [
    ...anchorsOf([REACH * 2, HEIGHT, REACH * 2], 'floor'),
    { kind: 'effect', id: 'spray', position: [0, 0.1, 0], effect: 'spray', size: 0.2 },
  ],
  channels: [
    {
      id: 'riserLift',
      target: 'riser',
      property: 'translate',
      axis: 'y',
      source: 'speed',
      map: { type: 'linear', in: [0, 0.02], out: [0, 0.056], clamp: true },
      motion: { type: 'pose', easeMs: 700 },
      reduced: 'hold',
    },
    spin('headTurn', ['head', 'y'], ['speed', [0, 1], [0, 0.25]]),
    ...jetChannels,
    ...status('glowRing'),
  ],
  states: {
    off: { power: false, online: true, speed: 0 },
    watering: { power: true, online: true, speed: 0.6 },
    fast: { power: true, online: true, speed: 1 },
    fault: { power: true, online: true, fault: true, speed: 0 },
    offline: { online: false },
  },
};

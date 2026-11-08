import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { disc, HEAT, look, OK, pivot, pulse } from './kit';

const HOUSE = { yaw: 30, pitch: 14, fov: 28, padding: 0.1, focus: 'case' } as const;
const W = 0.21;
const H = 0.46;
const D = 0.455;
const CASE_D = 0.42;
const CASE_Z = -0.012;
const FOOT = 0.014;
const BODY_Y = FOOT + H / 2;
const FRONT = CASE_Z + CASE_D / 2;
const FAN_Z = FRONT + 0.012;
const GLASS_Z = FRONT + 0.021;
const FAN_Y = [0.12, 0.245, 0.37] as const;
const BLADES = 5;
const FAN_RPS = 1.5;
const RING_GLOW = 2.1;

function fanParts(index: number, y: number): ModelSpecPart[] {
  const id = `fan${String(index)}`;
  const blades = Array.from({ length: BLADES }, (_, blade) => {
    const angle = (blade * 360) / BLADES;
    const rad = (angle * Math.PI) / 180;
    return box(`${id}Blade${String(blade)}`, [0.014, 0.036, 0.0016, 0.0006], 'glass', {
      at: [-Math.sin(rad) * 0.03, Math.cos(rad) * 0.03, 0],
      parent: id,
      transform: { rotation: [0, 0, angle + 18] },
      segments: 3,
      minLod: 2,
    });
  });
  return [
    pivot(id, { at: [0, y, FAN_Z] }),
    disc(`${id}Hub`, [0.016, 0.006, 0.002], 'body', { at: [0, 0, 0], parent: id }),
    {
      id: `${id}Ring`,
      geometry: { type: 'ring', innerRadius: 0.052, outerRadius: 0.059, segments: 32 },
      material: 'accent',
      transform: { position: [0, y, FAN_Z + 0.0015] },
    },
    ...blades,
  ];
}

function fanChannels(index: number): ModelSpecChannel[] {
  const id = `fan${String(index)}`;
  return [
    {
      id: `${id}Spin`,
      target: id,
      property: 'rotate',
      axis: 'z',
      source: 'speed',
      map: { type: 'speed', in: [0, 1], perSecond: [0, FAN_RPS] },
      motion: { type: 'spin' },
      reduced: 'hold',
    },
    look(`${id}Tint`, [`${id}Ring`, 'colour'], ['power', { true: OK }]),
    look(`${id}Hot`, [`${id}Ring`, 'colour'], ['thermal', { heating: HEAT }]),
    look(`${id}Glow`, [`${id}Ring`, 'emissive'], ['power', { true: RING_GLOW }]),
    pulse(`${id}Beat`, [`${id}Ring`, 'emissive'], ['thermal', { heating: RING_GLOW }], [1.5, 0.4]),
    ...emitterChannels(`${id}Ring`),
  ];
}

export const TOWER_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.computer.tower',
  version: '1.0.0',
  title: 'Tower PC',
  category: 'computer',
  family: 'computer',
  footprint: { width: W, depth: D, height: FOOT + H },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.12, focus: 'fan1' },
  },
  shots: [
    {
      id: 'run',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'power', op: 'eq', value: true },
              { signal: 'speed', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'fan1',
      zoom: 1.5,
      yaw: -14,
      pitch: 6,
      easeMs: 900,
      loopS: 8,
      symmetry: 360 / BLADES,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Tower PC',
      synonyms: ['desktop', 'desktop pc', 'gaming pc', 'workstation', 'computer tower', 'pc case'],
    },
    sizeClass: 'medium',
    variants: ['black', 'white'],
  },
  materials: {
    body: { finish: 'satin-black' },
    glass: { finish: 'smoked-acrylic', opacity: 0.5 },
    trim: { finish: 'rubber' },
    accent: { color: '#4A4E55', roughness: 0.35, metalness: 0.2 },
  },
  finishes: {
    black: {},
    white: {
      body: { finish: 'matte-white' },
      glass: { finish: 'frosted-glass', opacity: 0.5 },
      accent: { color: '#C9CDD3' },
    },
  },
  defaultFinish: 'black',
  parts: [
    box('case', [W, H, CASE_D, 0.012], 'body', { at: [0, BODY_Y, CASE_Z], contact: true }),
    box('glassFront', [W - 0.016, H - 0.03, 0.004, 0.006], 'glass', {
      at: [0, BODY_Y + 0.004, GLASS_Z],
    }),
    {
      id: 'topVent',
      parent: 'case',
      geometry: {
        type: 'grille',
        width: W - 0.07,
        height: 0.24,
        rows: 12,
        columns: 7,
        holeRadius: 0.0034,
      },
      material: 'trim',
      transform: { position: [0, H / 2 + 0.0006, -0.04], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    box('io', [0.11, 0.012, 0.004, 0.002], 'trim', {
      at: [0, H / 2 - 0.012, FRONT + 0.0006],
      parent: 'case',
      minLod: 1,
    }),
    disc('power', [0.007, 0.003, 0.0012], 'trim', {
      at: [W / 2 - 0.03, H / 2 - 0.012, FRONT + 0.0016],
      parent: 'case',
      minLod: 1,
    }),
    box('footFront', [W - 0.04, FOOT, 0.04, 0.005], 'trim', {
      at: [0, FOOT / 2, 0.14],
      contact: true,
    }),
    box('footBack', [W - 0.04, FOOT, 0.04, 0.005], 'trim', {
      at: [0, FOOT / 2, -0.17],
      contact: true,
    }),
    ...FAN_Y.flatMap((y, index) => fanParts(index, y)),
  ],
  anchors: [
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, FOOT + H + 0.04, 0] },
    { kind: 'hit', id: 'bodyHit', position: [0, BODY_Y, 0], size: [W, H, D] },
    {
      kind: 'effect',
      id: 'heat',
      parent: 'case',
      position: [0, H / 2, -0.04],
      effect: 'airflow',
      size: 0.14,
    },
  ],
  channels: FAN_Y.flatMap((_, index) => fanChannels(index)),
  states: {
    off: { power: false, online: true, speed: 0 },
    idle: { power: true, online: true, speed: 0.4, thermal: 'idle' },
    busy: { power: true, online: true, speed: 1, thermal: 'heating' },
    offline: { online: false },
  },
};

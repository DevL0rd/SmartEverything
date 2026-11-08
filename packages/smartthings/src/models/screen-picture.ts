import { emitterChannels, type ModelSpec, type ModelSpecChannel } from '@smarteverything/domain';

export const WIDTH = 1.445;
export const HEIGHT = 0.825;
export const DEPTH = 0.0112;
export const FACE = DEPTH / 2;
export const SCREEN_W = WIDTH - 0.012;
export const SCREEN_H = HEIGHT - 0.012;
export const HALF_H = SCREEN_H / 2;

export function look(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Record<string, number | string>],
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

interface Glow {
  readonly id: string;
  readonly at: readonly [x: number, y: number];
  readonly size: readonly [width: number, height: number];
  readonly home: string;
  readonly playing: string;
  readonly drift: number;
  readonly z: number;
}

const GLOWS: readonly Glow[] = [
  {
    id: 'auroraLeft',
    at: [-0.26, 0.05],
    size: [0.82, 0.68],
    home: '#4F8BFF',
    playing: '#2FB5A8',
    drift: 0.04,
    z: FACE + 0.004,
  },
  {
    id: 'auroraRight',
    at: [0.29, -0.08],
    size: [0.76, 0.6],
    home: '#7A5CFF',
    playing: '#F29A4E',
    drift: -0.04,
    z: FACE + 0.0046,
  },
  {
    id: 'auroraTop',
    at: [0.12, 0.2],
    size: [0.56, 0.36],
    home: '#3FC6E0',
    playing: '#E2557A',
    drift: 0.05,
    z: FACE + 0.0052,
  },
];

function glowPart(glow: Glow): ModelSpec['parts'][number] {
  const [width, height] = glow.size;
  return {
    id: glow.id,
    parent: 'bezel',
    geometry: { type: 'glow', width, height, segments: 48 },
    material: 'accent',
    transform: { position: [glow.at[0], glow.at[1], glow.z] },
    minLod: 1,
  };
}

function glowChannels(glow: Glow): ModelSpecChannel[] {
  return [
    look(`${glow.id}Home`, [glow.id, 'colour'], ['screenOn', { true: glow.home }]),
    look(`${glow.id}Play`, [glow.id, 'colour'], ['playing', { true: glow.playing }], 1200),
    look(`${glow.id}Show`, [glow.id, 'opacity'], ['screenOn', { true: 0.7, false: 0 }]),
    look(`${glow.id}Lit`, [glow.id, 'emissive'], ['screenOn', { true: 0.8, false: 0 }]),
    look(`${glow.id}Hide`, [glow.id, 'opacity'], ['power', { false: 0 }], 450),
    ...emitterChannels(glow.id),
    {
      id: `${glow.id}Drift`,
      target: glow.id,
      property: 'translate',
      axis: 'x',
      source: 'playing',
      map: { type: 'enum', table: { true: 1 } },
      motion: {
        type: 'oscillate',
        limits: [-Math.abs(glow.drift), Math.abs(glow.drift)],
        speed: Math.abs(glow.drift) / 3,
      },
      reduced: 'hold',
    },
  ];
}

const DOCK_Y = -HALF_H + 0.1;
const DOCK_Z = FACE + 0.0064;
const TILE_STEP = 0.16;

const DOCK_TILES = [-2, -1, 0, 1, 2].map((slot): ModelSpec['parts'][number] => ({
  id: `dockTile${String(slot + 3)}`,
  parent: 'homeDock',
  geometry: {
    type: 'roundedPlane',
    width: slot === 0 ? 0.15 : 0.13,
    height: slot === 0 ? 0.085 : 0.072,
    radius: 0.012,
    segments: 4,
  },
  material: 'sheen',
  transform: { position: [slot * TILE_STEP, 0, 0.0004] },
  minLod: 1,
}));

const HOME_UI: ModelSpec['parts'] = [
  {
    id: 'homeDock',
    parent: 'bezel',
    geometry: { type: 'roundedPlane', width: 0.9, height: 0.12, radius: 0.03, segments: 6 },
    material: 'sheen',
    transform: { position: [0, DOCK_Y, DOCK_Z] },
    minLod: 1,
  },
  ...DOCK_TILES,
  {
    id: 'homeClock',
    parent: 'homeDock',
    geometry: { type: 'roundedPlane', width: 0.11, height: 0.022, radius: 0.011, segments: 4 },
    material: 'sheen',
    transform: { position: [-0.56, HALF_H - 0.05 - DOCK_Y, 0.0004] },
    minLod: 1,
  },
];

const HOME_UI_CHANNELS: readonly ModelSpecChannel[] = [
  look('homeShow', ['homeDock', 'visible'], ['screenOn', { true: 1, false: 0 }]),
  look('homeHide', ['homeDock', 'visible'], ['playing', { true: 0 }]),
  look('homeOff', ['homeDock', 'visible'], ['power', { false: 0 }]),
  look('homeOffline', ['homeDock', 'visible'], ['online', { false: 0 }]),
];

export const PICTURE_PARTS: ModelSpec['parts'] = [...GLOWS.map(glowPart), ...HOME_UI];

export const PICTURE_CHANNELS: readonly ModelSpecChannel[] = [
  ...GLOWS.flatMap(glowChannels),
  ...HOME_UI_CHANNELS,
];

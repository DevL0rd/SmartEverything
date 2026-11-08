import {
  emitterChannels,
  OMNI_STATION_FOOTPRINT,
  OMNI_STATION_MODEL_ID,
  type ModelSpec,
} from '@smarteverything/domain';
import {
  BUSY,
  CONTACT,
  LED,
  POSE,
  box,
  channel,
  table,
  type Channel,
  type Part,
} from './vacuum-parts';

const WIDTH = OMNI_STATION_FOOTPRINT.w;
const DEPTH = OMNI_STATION_FOOTPRINT.d;
const HEIGHT = OMNI_STATION_FOOTPRINT.h;
const BODY_DEPTH = 0.289;
const BACK = -DEPTH / 2;
const FRONT = BACK + BODY_DEPTH;
const BAY_H = 0.105;
const BAY_BACK = -0.12;
const WALL = 0.004;
const TOWER_H = HEIGHT - BAY_H;
const TOWER_Y = BAY_H + TOWER_H / 2;
const TOWER_Z = BACK + BODY_DEPTH / 2;
const PANEL_Y = 0.41;
const TANK_H = 0.2;
const TANK_W = 0.14;
const TANK_X = 0.078;
const WARM = '#F2B45E';
const WASH = '#8EC8FF';
const DOCK: [number, number, number] = [0, 0.01, DEPTH / 2 - 0.175];

function tank(id: string, x: number, level: string, levelMaterial: string): Part[] {
  return [
    box({
      id,
      size: [TANK_W, TANK_H, 0.006],
      radius: 0.012,
      material: 'glass',
      at: [x, PANEL_Y, FRONT + 0.004],
    }),
    box({
      id: level,
      size: [TANK_W - 0.016, TANK_H - 0.02, 0.003],
      radius: 0.008,
      material: levelMaterial,
      at: [x, PANEL_Y, FRONT + 0.007],
    }),
  ];
}

function levelChannels(level: string, source: string): Channel[] {
  const span = (TANK_H - 0.02) * 0.95;
  return [
    {
      id: `${level}Scale`,
      target: level,
      property: 'scale',
      axis: 'y',
      source,
      map: { type: 'linear', in: [0, 1], out: [0.05, 1], clamp: true },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: `${level}Drop`,
      target: level,
      property: 'translate',
      axis: 'y',
      source,
      map: { type: 'linear', in: [0, 1], out: [-span / 2, 0], clamp: true },
      motion: POSE,
      reduced: 'hold',
    },
  ];
}

function stationShot(
  id: string,
  modes: readonly string[],
  loopS: number,
): NonNullable<ModelSpec['shots']>[number] {
  return {
    id,
    when: {
      anyOf: modes.map((value) => ({ allOf: [{ signal: 'mode', op: 'eq' as const, value }] })),
    },
    focus: 'tower',
    zoom: 1.05,
    yaw: 30,
    pitch: 28,
    easeMs: 1000,
    loopS,
    symmetry: 360,
    stillAt: loopS / 3,
  };
}

const BREATHE = { type: 'pulse', periodS: 1.6, amplitude: 0.5 } as const;
const SLOW_BREATHE = { type: 'pulse', periodS: 2.6, amplitude: 0.35 } as const;

const ACTIVITY_CHANNELS: Channel[] = [
  channel(
    ['trayColour', 'trayGlow', 'colour', 'mode'],
    { dry: WARM, air_dry: WARM, wash_mop: WASH, rewash: WASH },
    POSE,
  ),
  channel(
    ['trayWarm', 'trayGlow', 'emissive', 'mode'],
    { dry: 1.3, air_dry: 1, wash_mop: 0.9, rewash: 0.9 },
    SLOW_BREATHE,
  ),
  channel(['dustColour', 'dustLight', 'colour', 'mode'], { dust: LED }, POSE),
  channel(['dustLit', 'dustLight', 'emissive', 'mode'], { dust: 1.4 }, BREATHE),
  channel(['cleanFlow', 'cleanLevel', 'emissive', 'mode'], { wash_mop: 0.6, rewash: 0.6 }, BREATHE),
];

export const XIAOMI_PV11GL_STATION_MODEL: ModelSpec = {
  schema: 1,
  id: OMNI_STATION_MODEL_ID,
  version: '1.0.0',
  title: 'Xiaomi Omni station',
  category: 'cleaning',
  family: 'vacuum',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { yaw: 30, pitch: 24, fov: 28, padding: 0.08, focus: 'tower' },
    card: { yaw: 30, pitch: 24, fov: 28, padding: 0.1, focus: 'tower' },
    hero: { yaw: 30, pitch: 24, fov: 28, padding: 0.12, focus: 'tower' },
  },
  shots: [
    stationShot('wash', ['wash_mop', 'rewash'], 1.2),
    stationShot('dry', ['dry', 'air_dry'], 1.6),
    stationShot('dust', ['dust'], 1.5),
    stationShot('hair', ['cut_hair'], 1.2),
  ],
  meta: {
    names: {
      display: 'Omni station',
      synonyms: ['vacuum station', 'dock', 'base station', 'self-empty station'],
    },
    sizeClass: 'medium',
    variants: ['graphite', 'white', 'black'],
  },
  materials: {
    body: { color: '#4A4D54', roughness: 0.46, clearcoat: 0.25 },
    trim: { color: '#17181B', roughness: 0.32, clearcoat: 0.5 },
    glass: { finish: 'smoked-acrylic' },
    accent: { color: '#6DB0EE', roughness: 0.15, opacity: 0.85 },
  },
  finishes: {
    graphite: {},
    white: { body: { color: '#E8E6E1' }, trim: { color: '#2A2B2F' } },
    black: { body: { color: '#2C2D33' }, trim: { color: '#111214' } },
  },
  defaultFinish: 'graphite',
  parts: [
    box({
      id: 'tower',
      size: [WIDTH, TOWER_H, BODY_DEPTH],
      radius: 0.016,
      material: 'body',
      at: [0, TOWER_Y, TOWER_Z],
    }),
    box({
      id: 'bayBack',
      size: [WIDTH, BAY_H + 0.01, BAY_BACK - BACK],
      radius: 0.01,
      material: 'body',
      at: [0, (BAY_H + 0.01) / 2, (BACK + BAY_BACK) / 2],
      contact: true,
    }),
    ...[-1, 1].map((side) =>
      box({
        id: side < 0 ? 'bayWallLeft' : 'bayWallRight',
        size: [WALL, BAY_H + 0.01, FRONT - BAY_BACK],
        radius: 0.0015,
        material: 'body',
        at: [side * (WIDTH / 2 - WALL / 2), (BAY_H + 0.01) / 2, (FRONT + BAY_BACK) / 2],
        contact: true,
      }),
    ),
    box({
      id: 'panel',
      size: [WIDTH - 0.024, 0.3, 0.004],
      radius: 0.012,
      material: 'trim',
      at: [0, PANEL_Y, FRONT + 0.001],
    }),
    box({
      id: 'lid',
      size: [WIDTH - 0.03, 0.006, BODY_DEPTH - 0.03],
      radius: 0.003,
      material: 'trim',
      at: [0, HEIGHT + 0.001, TOWER_Z],
    }),
    box({
      id: 'dustLid',
      size: [0.13, 0.004, 0.11],
      radius: 0.002,
      material: 'body',
      at: [0.07, HEIGHT + 0.005, TOWER_Z - 0.05],
      minLod: 1,
    }),
    box({
      id: 'dustLight',
      size: [0.09, 0.003, 0.004],
      radius: 0.0015,
      material: 'trim',
      at: [0.07, HEIGHT + 0.005, TOWER_Z + 0.007],
      minLod: 1,
    }),
    box({
      id: 'grip',
      size: [0.044, 0.006, 0.012],
      radius: 0.003,
      material: 'body',
      at: [-0.07, HEIGHT + 0.005, TOWER_Z + 0.09],
      minLod: 2,
    }),
    ...tank('cleanTank', -TANK_X, 'cleanLevel', 'accent'),
    ...tank('dirtyTank', TANK_X, 'dirtyLevel', 'body'),
    box({
      id: 'indicator',
      size: [0.05, 0.012, 0.002],
      radius: 0.005,
      material: 'trim',
      at: [0, 0.205, FRONT + 0.0015],
    }),
    {
      id: 'progressRing',
      geometry: { type: 'ring', innerRadius: 0.031, outerRadius: 0.0335, segments: 48 },
      material: 'trim',
      transform: { position: [0, 0.205, FRONT + 0.0012] },
      minLod: 1,
    },
    box({
      id: 'trayGlow',
      size: [WIDTH - 0.05, 0.004, 0.006],
      radius: 0.0015,
      material: 'trim',
      at: [0, BAY_H - 0.003, FRONT - 0.004],
    }),
    box({
      id: 'ramp',
      size: [WIDTH - 2 * WALL, 0.01, DEPTH / 2 - BAY_BACK],
      radius: 0.004,
      material: 'trim',
      at: [0, 0.005, (DEPTH / 2 + BAY_BACK) / 2],
      contact: true,
    }),
    {
      id: 'ribs',
      parent: 'ramp',
      geometry: {
        type: 'slats',
        count: 6,
        spacing: 0.024,
        width: 0.28,
        height: 0.006,
        depth: 0.003,
      },
      material: 'body',
      transform: { position: [0, 0.0055, 0.09], rotation: [90, 0, 0] },
      minLod: 1,
    },
    ...[-1, 1].map((side) =>
      box({
        id: side < 0 ? 'contact1' : 'contact2',
        size: [0.05, 0.003, 0.015],
        radius: 0.0012,
        material: 'body',
        at: [side * 0.05, 0.0055, -0.14],
        parent: 'ramp',
        minLod: 1,
      }),
    ),
  ],
  anchors: [
    { kind: 'effect', id: 'wash', position: [0, 0.03, DOCK[2]], effect: 'water', size: 0.25 },
    { kind: 'effect', id: 'dry', position: [0, 0.05, DOCK[2]], effect: 'steam', size: 0.25 },
    {
      kind: 'effect',
      id: 'dust',
      position: [0.07, HEIGHT + 0.02, TOWER_Z - 0.05],
      effect: 'airflow',
      size: 0.2,
    },
    {
      kind: 'emitter',
      id: 'indicatorLight',
      position: [0, 0.205, FRONT + 0.01],
      color: LED,
      intensity: 0.3,
      radius: 0.03,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'dock', position: DOCK },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.06, TOWER_Z] },
    { kind: 'label', id: 'readout', position: [0, PANEL_Y, FRONT + 0.02] },
    { kind: 'hit', id: 'hit', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [
    ...levelChannels('cleanLevel', 'waterLevel'),
    ...levelChannels('dirtyLevel', 'fill'),
    channel(['indicatorColour', 'indicator', 'colour', 'mode'], table(BUSY, LED), POSE),
    channel(['indicatorBreathe', 'indicator', 'emissive', 'mode'], table(BUSY, 1), BREATHE),
    channel(['progressColour', 'progressRing', 'colour', 'mode'], table(BUSY, LED), POSE),
    channel(['progressLit', 'progressRing', 'emissive', 'mode'], table(BUSY, 0.8), POSE),
    channel(['indicatorLightOn', 'indicatorLight', 'emissive', 'mode'], table(BUSY, 1), BREATHE),
    ...ACTIVITY_CHANNELS,
    ...['contact1', 'contact2'].flatMap((id) => [
      channel([`${id}Colour`, id, 'colour', 'charging'], { true: CONTACT }, POSE),
      channel(
        [`${id}Glow`, id, 'emissive', 'charging'],
        { true: 0.8 },
        { type: 'pulse', periodS: 1.6, amplitude: 0.4 },
      ),
    ]),
    ...[
      'indicatorLight',
      'indicator',
      'progressRing',
      'trayGlow',
      'dustLight',
      'cleanLevel',
      'contact1',
      'contact2',
    ].flatMap((id) => emitterChannels(id)),
  ],
  states: {
    docked: { power: true, phase: 'docked_full', charging: false, waterLevel: 0.85, fill: 0.15 },
    charging: { power: true, phase: 'charging', charging: true, waterLevel: 0.85, fill: 0.15 },
    washing: {
      power: true,
      phase: 'washing_mop',
      mode: 'wash_mop',
      progress: 0.5,
      waterLevel: 0.6,
      fill: 0.4,
    },
    drying: {
      power: true,
      phase: 'station_busy',
      mode: 'dry',
      progress: 0.3,
      waterLevel: 0.55,
      fill: 0.45,
    },
    emptying: {
      power: true,
      phase: 'station_busy',
      mode: 'dust',
      progress: 0.6,
      waterLevel: 0.85,
      fill: 0.15,
    },
    hair: {
      power: true,
      phase: 'station_busy',
      mode: 'cut_hair',
      progress: 0.7,
      waterLevel: 0.8,
      fill: 0.2,
    },
    offline: { online: false },
  },
};

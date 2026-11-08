import type { ModelSpec, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { box } from '../../helpers/geometry';
import { look, MOVING_WHEN, OK } from './kit';

const HOUSE = { yaw: 24, pitch: 10, fov: 28, padding: 0.1, focus: 'void' } as const;
const OPEN_W = 2.4;
const OPEN_H = 2.1;
const JAMB = 0.12;
const FRAME_D = 0.14;
const HEADER_H = 0.5;
const PANEL_H = 0.5;
const PANEL_STEP = 0.52;
const PANELS = 4;
const WINDOWS = [-0.8, -0.4, 0, 0.4, 0.8];
const TURN_Y = OPEN_H + HEADER_H - PANEL_H / 2;
const TURN_SPAN = 0.08;
const TUCK_Z = -0.3;

function restY(index: number): number {
  return OPEN_H - PANEL_H / 2 - 0.01 - index * PANEL_STEP;
}

function rise(index: number): number {
  return TURN_Y - restY(index);
}

function turnAt(index: number): number {
  return rise(index) / (OPEN_H + HEADER_H);
}

function panel(index: number): ModelSpecPart {
  return box(`panel${String(index)}`, [OPEN_W - 0.01, PANEL_H, 0.046, 0.012], 'body', {
    at: [0, restY(index), 0.02],
  });
}

function linear(
  id: string,
  [target, property, axis]: readonly [string, ModelSpecChannel['property'], ('x' | 'y' | 'z')?],
  from: readonly [number, number],
  to: readonly [number, number],
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    ...(axis === undefined ? {} : { axis }),
    source: 'position',
    map: { type: 'linear', in: [from[0], from[1]], out: [to[0], to[1]], clamp: true },
    motion: { type: 'pose', easeMs: 1800 },
    reduced: 'hold',
  };
}

function panelChannels(index: number): ModelSpecChannel[] {
  const id = `panel${String(index)}`;
  const start = turnAt(index);
  const end = start + TURN_SPAN;
  return [
    linear(`${id}Rise`, [id, 'translate', 'y'], [0, start], [0, rise(index)]),
    linear(`${id}Tuck`, [id, 'translate', 'z'], [start, end], [0, TUCK_Z]),
    linear(`${id}Turn`, [id, 'rotate', 'x'], [start, end], [0, -90]),
    linear(`${id}Stow`, [id, 'visible'], [end, end + 0.02], [1, 0]),
  ];
}

function windowPane(x: number): ModelSpecPart {
  return box(
    `window${String(x)}`.replace('-', 'n').replace('.', 'p'),
    [0.3, 0.14, 0.008, 0.012],
    'glass',
    {
      at: [x, 0.02, 0.0245],
      parent: 'panel1',
      minLod: 1,
    },
  );
}

export const GARAGE_DOOR_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.cover.garage-door',
  version: '1.0.0',
  title: 'Garage door',
  category: 'cover',
  family: 'cover',
  footprint: { width: OPEN_W + 2 * JAMB, depth: FRAME_D, height: OPEN_H + HEADER_H },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.14, pitch: 14 },
  },
  shots: [
    {
      id: 'lift',
      when: MOVING_WHEN,
      focus: 'void',
      zoom: 1,
      yaw: -10,
      pitch: 8,
      easeMs: 1000,
      loopS: 1,
      symmetry: 360,
      stillAt: 0,
    },
  ],
  meta: {
    names: {
      display: 'Garage door',
      synonyms: [
        'sectional door',
        'overhead door',
        'garage',
        'roller garage door',
        'up and over door',
      ],
    },
    sizeClass: 'large',
    variants: ['white', 'anthracite'],
  },
  materials: {
    body: { finish: 'matte-white' },
    glass: { finish: 'frosted-glass' },
    trim: { finish: 'rubber' },
    accent: { color: OK, roughness: 0.3, opacity: 0 },
  },
  finishes: {
    white: {},
    anthracite: { body: { finish: 'graphite' } },
  },
  defaultFinish: 'white',
  parts: [
    box('jambLeft', [JAMB, OPEN_H + HEADER_H, FRAME_D, 0.016], 'body', {
      at: [-(OPEN_W + JAMB) / 2, (OPEN_H + HEADER_H) / 2, 0],
      contact: true,
    }),
    box('jambRight', [JAMB, OPEN_H + HEADER_H, FRAME_D, 0.016], 'body', {
      at: [(OPEN_W + JAMB) / 2, (OPEN_H + HEADER_H) / 2, 0],
      contact: true,
    }),
    box('header', [OPEN_W + 2 * JAMB, HEADER_H, FRAME_D, 0.016], 'body', {
      at: [0, OPEN_H + HEADER_H / 2, 0],
    }),
    box('void', [OPEN_W, OPEN_H, 0.01, 0.002], 'trim', { at: [0, OPEN_H / 2, -0.06] }),
    ...Array.from({ length: PANELS }, (_, index) => panel(index)),
    ...WINDOWS.map(windowPane),
    box('seal', [OPEN_W - 0.02, 0.03, 0.05, 0.012], 'trim', {
      at: [0, -PANEL_H / 2 + 0.005, 0],
      parent: `panel${String(PANELS - 1)}`,
    }),
    box('handle', [0.2, 0.026, 0.02, 0.01], 'trim', {
      at: [0, 0.02, 0.03],
      parent: `panel${String(PANELS - 1)}`,
      minLod: 1,
    }),
    {
      id: 'led',
      parent: 'header',
      geometry: { type: 'sphere', radius: 0.012, segments: 16 },
      material: 'accent',
      transform: { position: [0.9, -HEADER_H / 2 + 0.06, FRAME_D / 2 + 0.002] },
      minLod: 1,
    },
  ],
  anchors: [
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'wall' },
    { kind: 'label', id: 'pin', position: [0, OPEN_H + HEADER_H + 0.18, 0] },
    {
      kind: 'hit',
      id: 'bodyHit',
      position: [0, (OPEN_H + HEADER_H) / 2, 0],
      size: [OPEN_W + 2 * JAMB, OPEN_H + HEADER_H, FRAME_D],
    },
  ],
  channels: [
    ...Array.from({ length: PANELS }, (_, index) => panelChannels(index)).flat(),
    look('ledShow', ['led', 'opacity'], ['online', { true: 1, false: 0 }]),
    look('ledGlow', ['led', 'emissive'], ['online', { true: 0.9, false: 0 }]),
    look('ledFault', ['led', 'colour'], ['fault', { true: '#F2564E' }]),
  ],
  states: {
    closed: { position: 0, online: true },
    half: { position: 0.5, online: true },
    open: { position: 1, online: true },
    fault: { position: 0.2, online: true, fault: true },
    offline: { online: false },
  },
};

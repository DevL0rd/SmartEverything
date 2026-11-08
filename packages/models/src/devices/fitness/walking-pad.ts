import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { consoleChannels, mirrored } from './channels';

const HOUSE = { yaw: 30, pitch: 28, fov: 28, padding: 0.08, focus: 'deck' } as const;
const BELT_LENGTH = 1.1;
const BELT_REPEAT = 5;
const TOP_SPEED_MPS = 6 / 3.6;
const BLUR_FROM_KMH = 4;
const BLUR_FULL_KMH = 5.5;
const DECK_Y = 0.0595;
const TOP_Y = 0.107;

function beltRepeats(kmh: number): number {
  return (kmh / 3.6) * (BELT_REPEAT / BELT_LENGTH);
}

const FEET = [-1, 1].flatMap((side) =>
  [-1, 1].map((end): ModelSpecPart => ({
    id: `foot${side < 0 ? 'Left' : 'Right'}${end < 0 ? 'Front' : 'Rear'}`,
    parent: 'deck',
    geometry: {
      type: 'cylinder',
      height: 0.014,
      topRadius: 0.022,
      bottomRadius: 0.024,
      bevel: 0.005,
      segments: 24,
    },
    material: 'belt',
    transform: { position: [0.19 * side, -DECK_Y + 0.007, 0.5 * end] },
    contact: true,
  })),
);

const SIDES = mirrored((side, name): ModelSpecPart => ({
  id: `side${name}`,
  parent: 'deck',
  geometry: {
    type: 'roundedBox',
    width: 0.045,
    height: 0.012,
    depth: 1.18,
    radius: 0.005,
    segments: 3,
  },
  material: 'trim',
  transform: { position: [0.2275 * side, TOP_Y - DECK_Y + 0.0015, 0.02] },
}));

export const WALKING_PAD_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.treadmill.walking-pad',
  version: '1.0.0',
  title: 'Walking pad',
  category: 'fitness',
  family: 'treadmill',
  footprint: { width: 0.5, depth: 1.3, height: 0.12 },
  framing: {
    tile: { ...HOUSE, padding: 0.06 },
    card: HOUSE,
    hero: { ...HOUSE, padding: 0.1 },
  },
  shots: [
    {
      id: 'belt',
      when: {
        anyOf: [
          {
            allOf: [
              { signal: 'phase', op: 'eq', value: 'running' },
              { signal: 'speed', op: 'gt', value: 0 },
            ],
          },
        ],
      },
      focus: 'belt',
      zoom: 1,
      yaw: 24,
      pitch: 26,
      easeMs: 1000,
      loopS: 1,
      symmetry: 360,
      stillAt: 0.5,
    },
  ],
  meta: {
    names: {
      display: 'Walking pad',
      synonyms: ['under desk treadmill', 'folding treadmill', 'walking treadmill', 'treadmill'],
    },
    sizeClass: 'medium',
    variants: ['graphite', 'white'],
  },
  materials: {
    frame: { finish: 'graphite' },
    belt: { finish: 'rubber', pattern: 'grille' },
    trim: { finish: 'satin-black', roughness: 0.55 },
  },
  finishes: {
    graphite: {},
    white: { frame: { finish: 'matte-white' }, trim: { finish: 'graphite' } },
  },
  defaultFinish: 'graphite',
  parts: [
    {
      id: 'deck',
      geometry: {
        type: 'roundedBox',
        width: 0.5,
        height: 0.095,
        depth: 1.3,
        radius: 0.04,
        segments: 5,
      },
      material: 'frame',
      transform: { position: [0, DECK_Y, 0] },
    },
    {
      id: 'belt',
      parent: 'deck',
      geometry: {
        type: 'roundedPlane',
        width: 0.4,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'belt',
      transform: { position: [0, TOP_Y - DECK_Y + 0.001, 0.02], rotation: [-90, 0, 0] },
    },
    {
      id: 'beltBlur',
      parent: 'deck',
      geometry: {
        type: 'roundedPlane',
        width: 0.4,
        height: BELT_LENGTH,
        radius: 0.012,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, TOP_Y - DECK_Y + 0.0016, 0.02], rotation: [-90, 0, 0] },
    },
    ...SIDES,
    {
      id: 'cap',
      parent: 'deck',
      geometry: {
        type: 'roundedBox',
        width: 0.46,
        height: 0.016,
        depth: 0.12,
        radius: 0.007,
        segments: 4,
      },
      material: 'frame',
      transform: { position: [0, 0.0525, -0.58] },
      minLod: 1,
    },
    {
      id: 'screen',
      parent: 'cap',
      geometry: { type: 'roundedPlane', width: 0.14, height: 0.04, radius: 0.008, segments: 4 },
      material: 'trim',
      transform: { position: [0, 0.0085, 0], rotation: [-90, 0, 0] },
      minLod: 1,
    },
    ...FEET,
  ],
  anchors: [
    {
      kind: 'screen',
      id: 'display',
      parent: 'cap',
      position: [0, 0.0087, 0],
      rotation: [-90, 0, 0],
      width: 0.14,
      height: 0.04,
    },
    { kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, 0.2, 0] },
    { kind: 'label', id: 'readout', parent: 'cap', position: [0, 0.03, 0] },
    { kind: 'hit', id: 'deckHit', position: [0, 0.06, 0], size: [0.5, 0.12, 1.3] },
  ],
  channels: [
    {
      id: 'beltScroll',
      target: 'belt',
      property: 'uvScroll',
      source: 'speed',
      map: {
        type: 'speed',
        in: [0, 1],
        perSecond: [0, (TOP_SPEED_MPS * BELT_REPEAT) / BELT_LENGTH],
      },
      motion: { type: 'spin' },
      reduced: 'hold',
      blur: { part: 'beltBlur', from: beltRepeats(BLUR_FROM_KMH), to: beltRepeats(BLUR_FULL_KMH) },
    },
    ...consoleChannels('screen'),
  ],
  states: {
    off: { power: false },
    standby: { power: true, online: true, phase: 'standby', speed: 0 },
    slow: { power: true, online: true, phase: 'running', speed: 0.25 },
    walking: { power: true, online: true, phase: 'running', speed: 0.55 },
    brisk: { power: true, online: true, phase: 'running', speed: 0.85 },
    paused: { power: true, online: true, phase: 'paused', speed: 0 },
    offline: { online: false },
  },
};

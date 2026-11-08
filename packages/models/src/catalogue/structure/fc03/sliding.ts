import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial } from '../../../helpers/finishes';
import { HOUSE, STRUCTURE_FINISH_NAMES, anchorsOf, box, by, framingOf } from '../fc01/look';
import {
  DOOR_MATERIALS,
  DOOR_STATES,
  doorFinishes,
  doorFrame,
  fixedAxis,
  openShot,
  paramAxis,
  slide,
} from './frame';

const WIDTH = 2.4;
const SILL = 0.03;
const HEAD = 0.06;
const PANEL = 1.22;
const STILE = 0.05;
const RAIL = 0.07;
const TRACK = 0.026;

function outerFrame(): ModelSpecPart[] {
  const jambs = [-1, 1].map((side) =>
    box(
      side < 0 ? 'jambLeft' : 'jambRight',
      'frame',
      { w: STILE, h: by('height'), d: 0.12, r: 0.005 },
      { at: [side * (WIDTH / 2 - STILE / 2), by('height', 0.5), 0], contact: true },
    ),
  );
  return [
    ...jambs,
    box(
      'head',
      'frame',
      { w: WIDTH, h: HEAD, d: 0.12, r: 0.005 },
      { at: [0, by('height', 1, -HEAD / 2), 0] },
    ),
    box(
      'track',
      'frame',
      { w: WIDTH, h: SILL, d: 0.14, r: 0.005, seg: 4 },
      { at: [0, SILL / 2, 0.01], contact: true },
    ),
  ];
}

function panel(name: string, x: number, z: number): ModelSpecPart[] {
  const root = `rail${name}`;
  const rise = (scale: number, offset: number): ReturnType<typeof by> =>
    by('height', scale, offset);
  const stiles = [-1, 1].map((side) =>
    box(
      `stile${name}${side < 0 ? 'Left' : 'Right'}`,
      'frame',
      { w: STILE, h: rise(1, -SILL - HEAD), d: 0.045, r: 0.005 },
      { at: [side * (PANEL / 2 - STILE / 2), rise(0.5, -0.08), 0], parent: root },
    ),
  );
  return [
    box(root, 'frame', { w: PANEL, h: RAIL, d: 0.045, r: 0.005 }, { at: [x, SILL + RAIL / 2, z] }),
    ...stiles,
    box(
      `topRail${name}`,
      'frame',
      { w: PANEL, h: STILE, d: 0.045, r: 0.005 },
      { at: [0, rise(1, -0.16 + RAIL / 2 - STILE / 2), 0], parent: root },
    ),
    {
      id: `glass${name}`,
      parent: root,
      geometry: {
        type: 'roundedPlane',
        width: PANEL - 2 * STILE + 0.01,
        height: rise(1, -0.215),
        radius: 0.002,
        segments: 3,
      },
      material: 'glass',
      transform: { position: [0, rise(0.5, -0.07), 0] },
    },
  ];
}

export const DOOR_SLIDING_GLASS_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.door-sliding-glass',
  version: '1.0.0',
  title: 'Sliding glass door',
  category: 'structure',
  footprint: { width: WIDTH, depth: 0.14, height: 2.1 },
  size: { height: { param: 'height', extra: 0, resizes: true } },
  framing: framingOf(HOUSE),
  shots: [openShot('railSlide')],
  meta: {
    names: {
      display: 'Sliding glass door',
      synonyms: ['sliding door', 'patio door', 'glass door', 'slider', 'terrace door'],
    },
    sizeClass: 'large',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: { height: { min: 2, max: 2.6, default: 2.1, unit: 'm' } },
  materials: {
    frame: tokenMaterial('graphite'),
    glass: tokenMaterial('clear-glass'),
    accent: tokenMaterial('brushed-aluminium'),
  },
  ...finishSet(
    {
      plasterWhite: { frame: { finish: 'matte-white' } },
      warmWhite: { frame: { finish: 'warm-white' } },
      concrete: {},
      brick: { frame: { color: '#6E3B2E', roughness: 0.5 } },
      timber: { frame: { finish: 'oak' } },
    },
    'concrete',
  ),
  parts: [
    ...outerFrame(),
    ...panel('Fixed', WIDTH / 2 - STILE - PANEL / 2 + 0.01, -TRACK),
    ...panel('Slide', -(WIDTH / 2 - STILE - PANEL / 2 + 0.01), TRACK),
    box(
      'handle',
      'accent',
      { w: 0.02, h: 0.32, d: 0.025, r: 0.008 },
      {
        at: [-(PANEL / 2 - STILE / 2), 1 - SILL - RAIL / 2, 0.035],
        parent: 'railSlide',
      },
    ),
  ],
  anchors: anchorsOf({
    id: 'slidingDoor',
    mount: 'floor',
    size: [WIDTH, 2.1, 0.14],
    centreY: 1.05,
  }),
  channels: [slide('panelSlide', 'railSlide', WIDTH - 2 * STILE - PANEL)],
  states: DOOR_STATES,
};

const POCKET_W = 0.82;
const POCKET_D = 0.04;

function pocketLeaf(): ModelSpecPart[] {
  const pulls = [-1, 1].map((face) =>
    box(
      `pull${face > 0 ? 'Front' : 'Back'}`,
      'accent',
      { w: 0.024, h: 0.13, d: 0.004, r: 0.002 },
      {
        at: [POCKET_W / 2 - 0.08, by('height', -0.5, 1), face * (POCKET_D / 2 + 0.001)],
        parent: 'leaf',
        minLod: face > 0 ? 0 : 1,
      },
    ),
  );
  const panels = [-1, 1].map((row) =>
    box(
      `panel${row < 0 ? 'Low' : 'High'}`,
      'leaf',
      { w: POCKET_W - 0.2, h: by('height', 0.36), d: 0.006, r: 0.003 },
      { at: [0, by('height', row * 0.2), POCKET_D / 2 + 0.002], parent: 'leaf', minLod: 1 },
    ),
  );
  return [
    box(
      'leaf',
      'leaf',
      { w: POCKET_W - 0.006, h: by('height', 1, -0.008), d: POCKET_D, r: 0.004, seg: 4 },
      { at: [0, by('height', 0.5, 0.004), 0] },
    ),
    ...panels,
    ...pulls,
    box(
      'edgePull',
      'accent',
      { w: 0.004, h: 0.06, d: 0.02, r: 0.0015 },
      { at: [POCKET_W / 2 - 0.002, by('height', -0.5, 1), 0], parent: 'leaf', minLod: 2 },
    ),
  ];
}

export const DOOR_POCKET_MODEL: ModelSpec = {
  schema: 1,
  id: 'cat.structure.door-pocket',
  version: '1.0.0',
  title: 'Pocket door',
  category: 'structure',
  footprint: { width: 1.06, depth: 0.16, height: 2.153 },
  size: { height: { param: 'height', extra: 0.113, resizes: true } },
  framing: framingOf(HOUSE),
  shots: [openShot('leaf')],
  meta: {
    names: {
      display: 'Pocket door',
      synonyms: ['pocket door', 'cavity sliding door', 'recessed sliding door', 'hideaway door'],
    },
    sizeClass: 'tall',
    variants: [...STRUCTURE_FINISH_NAMES],
  },
  params: { height: { min: 1.9, max: 2.4, default: 2.04, unit: 'm' } },
  materials: DOOR_MATERIALS,
  ...doorFinishes('plasterWhite'),
  parts: [...doorFrame({ w: fixedAxis(POCKET_W), h: paramAxis('height') }), ...pocketLeaf()],
  anchors: anchorsOf({ id: 'pocketDoor', mount: 'floor', size: [1.06, 2.16, 0.16], centreY: 1.08 }),
  channels: [slide('leafSlide', 'leaf', -(POCKET_W - 0.06))],
  states: DOOR_STATES,
};

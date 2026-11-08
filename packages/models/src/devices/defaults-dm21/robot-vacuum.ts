import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { box, part, type Vec } from '../../helpers/geometry';
import { extrudePath, pathBuilder } from '../../helpers/path';
import {
  ACCENT,
  CHARGE,
  PRIMARY,
  anchorsOf,
  leaf,
  look,
  pulse,
  puck,
  shot,
  status,
  whenAll,
} from '../energy/kit';
import { turn } from './kit';

const R = 0.172;
const BODY_BOTTOM = 0.016;
const BODY_H = 0.064;
const TOP = BODY_BOTTOM + BODY_H;
const TURRET_R = 0.041;
const TURRET_H = 0.024;
const TURRET_Z = -0.034;
const HEIGHT = TOP + TURRET_H;
const BUMPER_DEG = 78;
const WORKING = { cleaning: 1 / 1.2, returning: 1 / 1.2 } as const;

function arcPoint(radius: number, deg: number): readonly [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [radius * Math.sin(rad), -radius * Math.cos(rad)];
}

function bumperPath(outer: number, inner: number): ReturnType<typeof extrudePath> {
  const [ox0, oy0] = arcPoint(outer, -BUMPER_DEG);
  const [ox1, oy1] = arcPoint(outer, BUMPER_DEG);
  const [ix1, iy1] = arcPoint(inner, BUMPER_DEG);
  const [ix0, iy0] = arcPoint(inner, -BUMPER_DEG);
  return extrudePath(
    pathBuilder(ox0, oy0)
      .arc({ rx: outer, ry: outer, sweep: true }, ox1, oy1)
      .line(ix1, iy1)
      .arc({ rx: inner, ry: inner, sweep: false }, ix0, iy0)
      .close(),
    0.03,
    0.0015,
  );
}

function sideBrush(id: string, at: Vec): ModelSpecPart[] {
  const arms = [0, 120, 240].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return part(
      `${id}Arm${String(deg)}`,
      { type: 'cylinder', height: 0.052, topRadius: 0.0011, bottomRadius: 0.0018, segments: 8 },
      'trim',
      {
        parent: id,
        transform: {
          position: [Math.cos(rad) * 0.028, -0.002, -Math.sin(rad) * 0.028],
          rotation: [0, deg, -90],
        },
        minLod: 1,
      },
    );
  });
  return [puck(id, [0.009, 0.005, 0.0015], 'trim', { at, segments: 20 }), ...arms];
}

export const ROBOT_VACUUM_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.vacuum.robot-generic',
  version: '1.0.0',
  title: 'Robot vacuum',
  category: 'cleaning',
  family: 'vacuum',
  footprint: { width: R * 2, depth: R * 2, height: HEIGHT },
  framing: {
    tile: { yaw: 30, pitch: 35, fov: 28, padding: 0.06, focus: 'body' },
    card: { yaw: 30, pitch: 35, fov: 28, padding: 0.1, focus: 'body' },
    hero: { yaw: 30, pitch: 35, fov: 28, padding: 0.14, focus: 'body' },
  },
  shots: [
    shot('clean', whenAll(leaf('phase', 'eq', 'cleaning')), 'turret', {
      zoom: 1.35,
      yaw: 24,
      pitch: 30,
      loopS: 1.2,
    }),
  ],
  meta: {
    names: {
      display: 'Robot vacuum',
      synonyms: [
        'robot vacuum cleaner',
        'robotic vacuum',
        'vacuum robot',
        'robot mop',
        'cleaning robot',
      ],
    },
    sizeClass: 'medium',
    variants: ['white', 'black'],
  },
  materials: {
    shell: { finish: 'matte-white', clearcoat: 0.5 },
    trim: { finish: 'graphite' },
    glass: { finish: 'smoked-acrylic', opacity: 0.85, clearcoat: 1 },
    accent: ACCENT,
  },
  finishes: {
    white: {},
    black: { shell: { finish: 'satin-black', clearcoat: 0.7 } },
  },
  defaultFinish: 'white',
  parts: [
    puck('skirt', [0.14, 0.014, 0.003], 'trim', { at: [0, 0.009, 0], contact: true }),
    part(
      'body',
      {
        type: 'cylinder',
        height: BODY_H,
        topRadius: R - 0.003,
        bottomRadius: R,
        bevel: 0.016,
        segments: 72,
      },
      'shell',
      { transform: { position: [0, BODY_BOTTOM + BODY_H / 2, 0] } },
    ),
    part('bumper', bumperPath(R + 0.0035, R - 0.006), 'trim', {
      transform: { position: [0, BODY_BOTTOM + 0.02, 0], rotation: [-90, 0, 0] },
    }),
    part('lid', { type: 'torus', radius: 0.128, tube: 0.0012, segments: 72 }, 'trim', {
      transform: { position: [0, TOP, 0], rotation: [90, 0, 0] },
      minLod: 1,
    }),
    puck('turret', [TURRET_R, TURRET_H, 0.005], 'trim', {
      at: [0, TOP + TURRET_H / 2 - 0.002, TURRET_Z],
      segments: 48,
    }),
    puck('window', [TURRET_R + 0.0008, 0.008, 0.001], 'glass', {
      at: [0, -0.003, 0],
      parent: 'turret',
      segments: 48,
      minLod: 1,
    }),
    puck('cap', [TURRET_R - 0.003, 0.003, 0.0012], 'shell', {
      at: [0, TURRET_H / 2, 0],
      parent: 'turret',
      segments: 48,
    }),
    box('glint', [0.022, 0.005, 0.002, 0.001], 'accent', {
      at: [0, -0.003, TURRET_R + 0.0012],
      parent: 'turret',
      segments: 3,
      minLod: 1,
    }),
    puck('power', [0.0085, 0.003, 0.001], 'trim', { at: [-0.014, TOP + 0.001, 0.05], minLod: 1 }),
    puck('home', [0.0085, 0.003, 0.001], 'trim', { at: [0.014, TOP + 0.001, 0.05], minLod: 1 }),
    part(
      'ringBed',
      {
        type: 'ring',
        innerRadius: TURRET_R + 0.0015,
        outerRadius: TURRET_R + 0.0078,
        segments: 56,
      },
      'trim',
      { transform: { position: [0, TOP + 0.0014, TURRET_Z], rotation: [-90, 0, 0] } },
    ),
    part(
      'ring',
      { type: 'ring', innerRadius: TURRET_R + 0.003, outerRadius: TURRET_R + 0.0062, segments: 56 },
      'accent',
      { transform: { position: [0, TOP + 0.002, TURRET_Z], rotation: [-90, 0, 0] } },
    ),
    ...sideBrush('brushLeft', [-0.09, 0.008, 0.118]),
    ...sideBrush('brushRight', [0.09, 0.008, 0.118]),
    box('dock', [0.074, 0.016, 0.004, 0.004], 'trim', {
      at: [0, BODY_BOTTOM + 0.02, -R + 0.0006],
      minLod: 1,
    }),
    ...[-1, 1].map((side) =>
      box(`contact${side < 0 ? 'Left' : 'Right'}`, [0.014, 0.005, 0.002, 0.001], 'shell', {
        at: [side * 0.02, BODY_BOTTOM + 0.02, -R - 0.0016],
        segments: 3,
        minLod: 2,
      }),
    ),
  ],
  anchors: [
    ...anchorsOf([R * 2, HEIGHT, R * 2], 'floor'),
    {
      kind: 'emitter',
      id: 'statusGlow',
      position: [0, TOP + 0.006, TURRET_Z + TURRET_R + 0.005],
      color: PRIMARY,
      intensity: 0.3,
      radius: 0.08,
    },
  ],
  channels: [
    turn('turretSpin', ['turret', 'y'], ['phase', WORKING]),
    turn('brushLeftSpin', ['brushLeft', 'y'], ['phase', { cleaning: -2.5 }]),
    turn('brushRightSpin', ['brushRight', 'y'], ['phase', { cleaning: 2.5 }]),
    look('glintShow', ['glint', 'opacity'], ['phase', { cleaning: 1, returning: 1 }]),
    look('glintLit', ['glint', 'emissive'], ['phase', { cleaning: 1.3, returning: 1.3 }]),
    look('glintOffline', ['glint', 'opacity'], ['online', { false: 0 }], 450),
    ...status('ring'),
    look('ringCharge', ['ring', 'colour'], ['charging', { true: CHARGE }]),
    pulse('ringBreathe', ['ring', 'emissive'], ['charging', { true: 1 }], [2, 0.5]),
    look('ringSleep', ['ring', 'emissive'], ['power', { false: 0 }], 450),
    look('ringHide', ['ring', 'opacity'], ['power', { false: 0 }], 450),
    ...emitterChannels('statusGlow', ['phase', { cleaning: 1, returning: 0.8, charging: 0.6 }]),
  ],
  states: {
    docked: { power: true, online: true, phase: 'docked', charging: false, battery: 1 },
    charging: { power: true, online: true, phase: 'charging', charging: true, battery: 0.4 },
    cleaning: { power: true, online: true, phase: 'cleaning', cleanMode: 'sweep', battery: 0.7 },
    returning: { power: true, online: true, phase: 'returning', battery: 0.2 },
    lowBattery: { power: true, online: true, phase: 'docked', batteryLow: true, battery: 0.08 },
    fault: { power: true, online: true, phase: 'docked', fault: true },
    off: { power: false, online: true },
    offline: { online: false },
  },
};

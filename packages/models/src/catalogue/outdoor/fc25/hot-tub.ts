import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { colorMaterial, finishSet, tokenMaterial } from '../../../helpers/finishes';
import { block, by, catalogueModel, glowChannel, hoop, rod, whileOn } from './kit';

const SEAT_RADIUS = 0.11;
const RIM_Y = 0.96;
const HEADRESTS = [135, 180, 225] as const;
const DEG = Math.PI / 180;

function onRim(
  angle: number,
  inset: number,
): [ReturnType<typeof by>, number, ReturnType<typeof by>] {
  const cos = Math.cos(angle * DEG);
  const sin = Math.sin(angle * DEG);
  return [by('diameter', 0.5 * cos, -inset * cos), 0, by('diameter', 0.5 * sin, -inset * sin)];
}

function headrests(): ModelSpecPart[] {
  return HEADRESTS.map((angle) => {
    const [x, , z] = onRim(angle, SEAT_RADIUS);
    return block(`headrest${String(angle)}`, 'shell', [0.36, 0.1, 0.14], {
      round: 0.035,
      segments: 3,
      at: [x, RIM_Y + 0.05, z],
      turn: [0, 90 - angle, 0],
      minLod: 1,
    });
  });
}

function controls(): ModelSpecPart[] {
  const [x, , z] = onRim(300, SEAT_RADIUS);
  return [
    block('panel', 'accent', [0.18, 0.03, 0.1], {
      round: 0.012,
      segments: 3,
      at: [x, RIM_Y + 0.015, z],
      turn: [0, 90 - 300, 0],
    }),
  ];
}

function jets(): ModelSpecPart[] {
  return [200, 240, 280, 320].map((angle) => {
    const [x, , z] = onRim(angle, 0.19);
    return rod(
      `jet${String(angle)}`,
      'accent',
      { height: 0.02, top: 0.035, bevel: 0.006, segments: 24 },
      { at: [x, RIM_Y + 0.01, z], minLod: 1 },
    );
  });
}

export const HOT_TUB_MODEL: ModelSpec = catalogueModel({
  id: 'cat.outdoor.hot-tub',
  title: 'Hot tub',
  category: 'outdoor',
  footprint: { width: 2.595, depth: 2.03, height: 1.06 },
  size: {
    width: { param: 'diameter', extra: 0.595, resizes: true },
    depth: { param: 'diameter', extra: 0.03, resizes: true },
  },
  meta: {
    names: {
      display: 'Hot tub',
      synonyms: ['hot tub', 'spa', 'jacuzzi', 'whirlpool', 'garden spa', 'soaking tub'],
    },
    sizeClass: 'large',
  },
  params: { diameter: { min: 1.5, max: 2.6, default: 2, unit: 'm' } },
  materials: {
    cabinet: tokenMaterial('oak'),
    shell: tokenMaterial('ceramic', { roughness: 0.3 }),
    water: colorMaterial('#5FC7E6', { roughness: 0.1, clearcoat: 1, opacity: 0.75 }),
    accent: tokenMaterial('chrome'),
  },
  finish: finishSet(
    {
      oak: {},
      walnut: { cabinet: { finish: 'walnut' } },
      ash: { cabinet: { finish: 'ash' } },
      charcoal: { cabinet: { finish: 'graphite' }, shell: { color: '#C9CDD2' } },
    },
    'oak',
  ),
  parts: [
    rod(
      'cabinet',
      'cabinet',
      { height: 0.84, top: by('diameter', 0.5), bevel: 0.035, segments: 64 },
      { at: [0, 0.42, 0], contact: true },
    ),
    rod(
      'shell',
      'shell',
      { height: 0.14, top: by('diameter', 0.5, 0.015), bevel: 0.05, segments: 64 },
      { at: [0, 0.89, 0] },
    ),
    rod(
      'water',
      'water',
      { height: 0.03, top: by('diameter', 0.5, -0.22), bevel: 0.01, segments: 64 },
      { at: [0, 0.965, 0] },
    ),
    hoop(
      'lip',
      'shell',
      { radius: by('diameter', 0.5, -0.2), tube: 0.04, segments: 64 },
      { at: [0, 0.975, 0] },
    ),
    block('step', 'cabinet', [0.6, 0.42, 0.95], {
      round: 0.03,
      segments: 3,
      at: [by('diameter', 0.5, 0.28), 0.21, 0],
      contact: true,
    }),
    ...headrests(),
    ...controls(),
    ...jets(),
  ],
  anchors: [
    {
      kind: 'emitter',
      id: 'tubLight',
      parent: 'water',
      position: [0, 0, 0],
      color: '#9FE8FF',
      intensity: 1,
      radius: 1.8,
    },
    {
      kind: 'effect',
      id: 'steam',
      parent: 'water',
      position: [0, 0.12, 0],
      effect: 'steam',
      size: 1,
    },
  ],
  channels: [
    glowChannel('waterGlow', 'water', 'power'),
    glowChannel('lightGlow', 'tubLight', 'power'),
  ],
  shots: [
    whileOn({
      id: 'soaking',
      signal: 'power',
      focus: 'water',
      zoom: 1.2,
      yaw: -10,
      pitch: 24,
      loopS: 3,
      stillAt: 1,
    }),
  ],
  states: { off: { power: false }, on: { power: true } },
});

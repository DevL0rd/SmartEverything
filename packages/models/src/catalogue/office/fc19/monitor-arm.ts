import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, rod } from '../../living/fc06/kit';
import { metalFinishes, officeItem } from './kit';

const POST_Z = -0.16;
const ARM = 0.036;
const REACH = 0.24;

const ELBOW_Z = POST_Z + REACH;
const HEAD_Z = ELBOW_Z + REACH - 0.02;

function joints(): ModelSpecPart[] {
  const pivot = by('height', 1, -0.03);
  return [
    block('lowerArm', 'frame', [0.05, ARM, REACH + 0.04], {
      at: [0, pivot, POST_Z + REACH / 2],
      round: 0.014,
      segments: 3,
    }),
    block('upperArm', 'frame', [0.045, ARM - 0.004, REACH + 0.04], {
      at: [0, by('height', 1, -0.03 + 0.036), ELBOW_Z + REACH / 2 - 0.01],
      round: 0.013,
      segments: 3,
    }),
    rod(
      'elbow',
      'accent',
      { height: 0.07, top: 0.022, segments: 32 },
      {
        at: [0, by('height', 1, 0.003), ELBOW_Z],
      },
    ),
    rod(
      'shoulder',
      'accent',
      { height: 0.08, top: 0.024, segments: 32 },
      {
        at: [0, pivot, POST_Z],
      },
    ),
    rod(
      'swivel',
      'accent',
      { height: 0.06, top: 0.017, segments: 24 },
      {
        at: [0, by('height', 1, 0.003), HEAD_Z],
      },
    ),
  ];
}

function head(): ModelSpecPart[] {
  return [
    block('plate', 'frame', [0.11, 0.11, 0.012], {
      at: [0, by('height', 1, 0.003), HEAD_Z + 0.03],
      round: 0.006,
      segments: 3,
    }),
    ...([-1, 1] as const).flatMap((sx) =>
      ([-1, 1] as const).map((sy) =>
        rod(
          `screw${sx < 0 ? 'L' : 'R'}${sy < 0 ? 'D' : 'U'}`,
          'accent',
          { height: 0.006, top: 0.007, segments: 16 },
          {
            at: [sx * 0.038, by('height', 1, 0.003 + sy * 0.038), HEAD_Z + 0.039],
            turn: [90, 0, 0],
            minLod: 1,
          },
        ),
      ),
    ),
  ];
}

export const MONITOR_ARM_MODEL: ModelSpec = officeItem({
  id: 'cat.office.monitor-arm',
  title: 'Monitor arm',
  footprint: { width: 0.16, depth: 0.58, height: 0.508 },
  size: { height: { param: 'height', extra: 0.058, resizes: true } },
  meta: {
    names: {
      display: 'Monitor arm',
      synonyms: [
        'monitor stand arm',
        'screen arm',
        'desk mount monitor arm',
        'articulating monitor mount',
        'display arm',
      ],
    },
    sizeClass: 'small',
    aliases: ['cat.office.monitor-mount'],
  },
  params: { height: { min: 0.3, max: 0.6, default: 0.45, unit: 'm' } },
  materials: {
    frame: { finish: 'graphite' },
    accent: { finish: 'chrome' },
  },
  finishes: metalFinishes(['frame']),
  defaultFinish: 'graphite',
  pitch: 16,
  mount: 'desk',
  parts: [
    rod(
      'base',
      'frame',
      { height: 0.018, top: 0.085, segments: 48 },
      {
        at: [0, 0.009, POST_Z],
        contact: true,
      },
    ),
    rod(
      'post',
      'frame',
      { height: by('height', 1, -0.018), top: 0.018, segments: 32 },
      {
        at: [0, by('height', 0.5, 0.009), POST_Z],
      },
    ),
    ...joints(),
    ...head(),
  ],
});

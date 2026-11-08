import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  block,
  by,
  corners,
  legs,
  piece,
  rod,
  upholsteryOf,
  woodFinishes,
  woodOf,
} from '../../living/fc06/kit';
import { MIRROR_MATERIAL, bedroomItem } from '../fc14/kit';

const DEPTH = 0.64;
const TABLE_D = 0.42;
const TABLE_Z = -0.11;
const TABLE_H = 0.75;
const TOP = 0.03;
const LEG = TABLE_H - TOP;
const TILT = 82;
const MIRROR_Z = TABLE_Z - 0.14;
const STOOL_Z = 0.15;
const STOOL_SEAT = 0.45;

function sideAprons(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    block(`apronSide${side < 0 ? 'Left' : 'Right'}`, 'body', [0.02, 0.085, TABLE_D - 0.1], {
      at: [by('width', side / 2, -side * 0.045), LEG - 0.0425, TABLE_Z],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
  );
}

function tableParts(): ModelSpecPart[] {
  const feet = corners(
    by('width', 0.5, -0.045),
    TABLE_Z + TABLE_D / 2 - 0.045,
    by('width', -0.5, 0.045),
    TABLE_Z - TABLE_D / 2 + 0.045,
  );
  const front = TABLE_Z + TABLE_D / 2 - 0.035;
  return [
    block('top', 'body', [by('width', 1), TOP, TABLE_D], {
      at: [0, TABLE_H - TOP / 2, TABLE_Z],
      round: 0.01,
      segments: 3,
    }),
    block('apron', 'body', [by('width', 1, -0.07), 0.085, 0.02], {
      at: [0, LEG - 0.0425, front],
      round: 0.005,
      segments: 3,
    }),
    block('drawer', 'body', [by('width', 0.5), 0.07, 0.022], {
      at: [0, LEG - 0.0425, front + 0.016],
      round: 0.006,
      segments: 3,
    }),
    rod(
      'knob',
      'accent',
      { height: 0.02, top: 0.014, segments: 24 },
      {
        at: [0, LEG - 0.0425, front + 0.036],
        turn: [90, 0, 0],
        minLod: 1,
      },
    ),
    block('apronBack', 'body', [by('width', 1, -0.07), 0.085, 0.02], {
      at: [0, LEG - 0.0425, TABLE_Z - TABLE_D / 2 + 0.035],
      round: 0.005,
      segments: 3,
      minLod: 1,
    }),
    ...sideAprons(),
    ...legs('body', feet, { height: LEG, top: 0.022, bottom: 0.013 }),
  ];
}

function mirrorParts(): ModelSpecPart[] {
  const tilt = (TILT * Math.PI) / 180;
  const centreY = TABLE_H + 0.3 * Math.sin(tilt) + 0.02;
  const scale = [0.75, 1, 1] as const;
  return [
    block('mirrorBase', 'body', [0.22, 0.03, 0.09], {
      at: [0, TABLE_H + 0.015, MIRROR_Z],
      round: 0.01,
      segments: 3,
    }),
    piece(
      'mirrorFrame',
      'body',
      {
        type: 'cylinder',
        height: 0.035,
        topRadius: 0.3,
        bottomRadius: 0.3,
        bevel: 0.01,
        segments: 64,
      },
      { at: [0, centreY, MIRROR_Z], turn: [TILT, 0, 0], scale },
    ),
    piece(
      'mirrorGlass',
      'mirror',
      { type: 'cylinder', height: 0.012, topRadius: 0.275, bottomRadius: 0.275, segments: 64 },
      {
        at: [0, centreY + 0.02 * Math.cos(tilt), MIRROR_Z + 0.02 * Math.sin(tilt)],
        turn: [TILT, 0, 0],
        scale,
      },
    ),
  ];
}

function stoolParts(): ModelSpecPart[] {
  const feet = corners(0.1, STOOL_Z + 0.1, -0.1, STOOL_Z - 0.1);
  return [
    piece(
      'stoolSeat',
      'fabric',
      {
        type: 'cylinder',
        height: 0.08,
        topRadius: 0.17,
        bottomRadius: 0.17,
        bevel: 0.025,
        segments: 48,
      },
      { at: [0, STOOL_SEAT - 0.04, STOOL_Z] },
    ),
    piece(
      'stoolRing',
      'body',
      {
        type: 'cylinder',
        height: 0.03,
        topRadius: 0.15,
        bottomRadius: 0.15,
        bevel: 0.006,
        segments: 48,
      },
      { at: [0, STOOL_SEAT - 0.095, STOOL_Z], minLod: 1 },
    ),
    ...legs('body', feet, { height: STOOL_SEAT - 0.08, top: 0.018, bottom: 0.012 }).map(
      (leg, index) => ({
        ...leg,
        id: `stoolLeg${String(index + 1)}`,
        minLod: 1 as const,
      }),
    ),
  ];
}

export const DRESSING_TABLE_MODEL: ModelSpec = bedroomItem({
  id: 'cat.bedroom.dressing-table',
  title: 'Dressing table',
  footprint: { width: 1.1, depth: DEPTH, height: 1.4 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Dressing table',
      synonyms: ['vanity', 'vanity table', 'makeup table', 'dresser with mirror', 'vanity desk'],
    },
    sizeClass: 'large',
    aliases: ['cat.bedroom.vanity'],
  },
  params: { width: { min: 0.9, max: 1.4, default: 1.1, unit: 'm' } },
  materials: {
    body: woodOf('walnut'),
    fabric: upholsteryOf('oat'),
    mirror: MIRROR_MATERIAL,
    accent: { finish: 'brushed-aluminium' },
  },
  finishes: woodFinishes(['body']),
  defaultFinish: 'walnut',
  pitch: 14,
  wall: true,
  parts: [...tableParts(), ...mirrorParts(), ...stoolParts()],
});

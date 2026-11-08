import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { block, by, piece, rod, type Vec } from '../../living/fc06/kit';
import { kitchenItem } from './kit';

const DEPTH = 0.34;
const FOOT = 0.012;
const TRAY_H = 0.03;
const TRAY_TOP = FOOT + TRAY_H;
const FLOOR_Y = 0.06;
const BAR = 0.006;
const BAR_H = 0.16;
const ROW_BACK = -0.1;
const ROW_FRONT = -0.02;
const BARS = 9;
const SPAN = 0.06;

function wireRod(id: string, y: number, z: number): ModelSpecPart {
  return piece(
    id,
    'wire',
    {
      type: 'cylinder',
      height: by('width', 1, -SPAN),
      topRadius: 0.004,
      bottomRadius: 0.004,
      segments: 12,
    },
    { at: [0, y, z], turn: [0, 0, 90], minLod: 1 },
  );
}

function trayParts(): ModelSpecPart[] {
  const rim = (id: string, size: Vec, at: Vec): ModelSpecPart =>
    block(id, 'tray', size, { at, round: 0.004, segments: 3, minLod: 1 });
  return [
    block('tray', 'tray', [by('width', 1), TRAY_H, DEPTH], {
      at: [0, FOOT + TRAY_H / 2, 0],
      round: 0.012,
      contact: true,
    }),
    rim('rimFront', [by('width', 1), 0.02, 0.012], [0, TRAY_TOP + 0.008, DEPTH / 2 - 0.006]),
    rim('rimBack', [by('width', 1), 0.02, 0.012], [0, TRAY_TOP + 0.008, -DEPTH / 2 + 0.006]),
    rim('rimLeft', [0.012, 0.02, DEPTH], [by('width', -0.5, 0.006), TRAY_TOP + 0.008, 0]),
    rim('rimRight', [0.012, 0.02, DEPTH], [by('width', 0.5, -0.006), TRAY_TOP + 0.008, 0]),
    block('spout', 'tray', [0.06, 0.018, 0.05], {
      at: [by('width', 0.5, -0.07), TRAY_TOP - 0.004, DEPTH / 2 + 0.02],
      round: 0.006,
      segments: 3,
      minLod: 1,
    }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        rod(
          `foot${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`,
          'accent',
          { height: FOOT, top: 0.016, segments: 16 },
          { at: [by('width', sx / 2, -sx * 0.04), FOOT / 2, sz * (DEPTH / 2 - 0.04)], minLod: 1 },
        ),
      ),
    ),
  ];
}

function floorParts(): ModelSpecPart[] {
  return [
    piece(
      'floorBars',
      'wire',
      {
        type: 'slats',
        count: 12,
        spacing: 0.026,
        width: by('width', 1, -SPAN),
        height: BAR,
        depth: BAR,
      },
      { at: [0, FLOOR_Y, 0], turn: [90, 0, 0] },
    ),
    piece(
      'floorCross',
      'wire',
      {
        type: 'slats',
        count: BARS,
        spacing: by('width', 0.125, -0.0075),
        width: BAR,
        height: BAR,
        depth: 0.29,
      },
      { at: [0, FLOOR_Y - 0.007, 0], turn: [0, 0, 90], minLod: 2 },
    ),
  ];
}

function plateRack(): ModelSpecPart[] {
  const bars = (id: string, z: number, minLod: 1 | 2 = 1): ModelSpecPart =>
    piece(
      id,
      'wire',
      {
        type: 'slats',
        count: BARS,
        spacing: by('width', 0.125, -0.0075),
        width: BAR_H,
        height: BAR,
        depth: BAR,
      },
      { at: [0, FLOOR_Y + BAR_H / 2, z], turn: [0, 0, 90], minLod },
    );
  return [
    bars('barsBack', ROW_BACK),
    bars('barsFront', ROW_FRONT, 2),
    wireRod('railBack', FLOOR_Y + BAR_H, ROW_BACK),
    wireRod('railFront', FLOOR_Y + BAR_H, ROW_FRONT),
    ...[-0.1, 0.1].map((share, index) =>
      piece(
        `plate${String(index + 1)}`,
        'plate',
        {
          type: 'cylinder',
          height: 0.014,
          topRadius: 0.1,
          bottomRadius: 0.1,
          bevel: 0.004,
          segments: 48,
        },
        {
          at: [by('width', share), FLOOR_Y + 0.105, (ROW_BACK + ROW_FRONT) / 2],
          turn: [0, 0, 90],
          minLod: 1,
        },
      ),
    ),
  ];
}

function cutleryParts(): ModelSpecPart[] {
  const x = by('width', 0.5, -0.085);
  const cup = piece(
    'cup',
    'tray',
    {
      type: 'cylinder',
      height: 0.11,
      topRadius: 0.047,
      bottomRadius: 0.042,
      bevel: 0.006,
      segments: 32,
    },
    { at: [x, FLOOR_Y + 0.055, 0.1] },
  );
  const tools = [
    [-0.012, 0.004, 8, -6],
    [0.012, -0.006, -7, 5],
    [0, 0.014, 4, 9],
    [0.002, -0.012, -9, -4],
  ].map(([dx = 0, dz = 0, tx = 0, tz = 0], index) =>
    piece(
      `tool${String(index + 1)}`,
      'wire',
      { type: 'cylinder', height: 0.15, topRadius: 0.005, bottomRadius: 0.004, segments: 12 },
      {
        at: [by('width', 0.5, -0.085 + dx), FLOOR_Y + 0.12, 0.1 + dz],
        turn: [tx, 0, tz],
        minLod: 2,
      },
    ),
  );
  return [cup, ...tools];
}

export const DISH_RACK_MODEL: ModelSpec = kitchenItem({
  id: 'cat.kitchen.dish-rack',
  title: 'Dish rack',
  footprint: { width: 0.46, depth: DEPTH, height: 0.27 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  meta: {
    names: {
      display: 'Dish rack',
      synonyms: ['dish drainer', 'drying rack', 'plate rack', 'draining rack', 'dish drying rack'],
    },
    sizeClass: 'small',
    aliases: ['cat.kitchen.dish-drainer'],
  },
  params: { width: { min: 0.36, max: 0.6, default: 0.46, unit: 'm' } },
  materials: {
    tray: { finish: 'brushed-aluminium' },
    wire: { finish: 'brushed-aluminium' },
    plate: { finish: 'ceramic' },
    accent: { finish: 'rubber' },
  },
  defaultFinish: 'stainless',
  slots: { body: ['tray'], coated: ['wire'] },
  pitch: 24,
  parts: [...trayParts(), ...floorParts(), ...plateRack(), ...cutleryParts()],
});

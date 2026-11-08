import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import {
  CUSHION_COLOURS,
  OUTDOOR_FRAME,
  OUTDOOR_METAL,
  block,
  fabric,
  outdoorItem,
  rod,
} from './kit';

const WIDTH = 0.66;
const SEAT_Y = 0.32;
const SEAT_END = 1.1;
const HINGE = -0.05;
const BACK_LENGTH = 0.86;
const TILT = 35;
const SIN = Math.sin((TILT * Math.PI) / 180);
const COS = Math.cos((TILT * Math.PI) / 180);
const HEAD = HINGE - BACK_LENGTH * COS;
const MID = (SEAT_END + HEAD) / 2;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function legs(): ModelSpecPart[] {
  return [SEAT_END - 0.1, HINGE + 0.05].flatMap((z, row) =>
    [-1, 1].map((side) =>
      block(
        `leg${side < 0 ? 'L' : 'R'}${String(row + 1)}`,
        'frame',
        [0.045, SEAT_Y - 0.07, 0.045],
        {
          at: [side * (WIDTH / 2 - 0.03), (SEAT_Y - 0.07) / 2, round4(z - MID)],
          round: 0.01,
          segments: 3,
          contact: true,
        },
      ),
    ),
  );
}

function wheels(): ModelSpecPart[] {
  return [-1, 1].map((side) =>
    rod(
      side < 0 ? 'wheelLeft' : 'wheelRight',
      'accent',
      { height: 0.03, top: 0.05, segments: 24 },
      {
        at: [side * (WIDTH / 2 + 0.005), 0.05, round4(SEAT_END - 0.1 - MID)],
        turn: [0, 0, 90],
        minLod: 1,
      },
    ),
  );
}

function backParts(): ModelSpecPart[] {
  const centre = {
    y: SEAT_Y - 0.05 + (BACK_LENGTH / 2) * SIN,
    z: HINGE - (BACK_LENGTH / 2) * COS - MID,
  };
  const lift = 0.06;
  return [
    block('backFrame', 'frame', [WIDTH, 0.04, BACK_LENGTH], {
      at: [0, round4(centre.y), round4(centre.z)],
      turn: [TILT, 0, 0],
      round: 0.012,
      segments: 3,
    }),
    block('backPad', 'cushion', [WIDTH - 0.06, 0.07, BACK_LENGTH - 0.04], {
      at: [0, round4(centre.y + lift * COS), round4(centre.z + lift * SIN)],
      turn: [TILT, 0, 0],
      round: 0.03,
      segments: 3,
    }),
  ];
}

export const SUN_LOUNGER_MODEL: ModelSpec = outdoorItem({
  id: 'cat.outdoor.sun-lounger',
  title: 'Sun lounger',
  footprint: { width: WIDTH, depth: round4(SEAT_END - HEAD), height: 0.8 },
  meta: {
    names: {
      display: 'Sun lounger',
      synonyms: ['sunbed', 'deck lounger', 'pool lounger', 'reclining lounger', 'garden lounger'],
    },
    sizeClass: 'large',
    aliases: ['cat.outdoor.lounger', 'cat.outdoor.sunbed'],
  },
  materials: {
    frame: OUTDOOR_FRAME,
    cushion: fabric(CUSHION_COLOURS.teak),
    accent: OUTDOOR_METAL,
  },
  slots: { frame: ['frame'], cloth: ['cushion'] },
  pitch: 24,
  parts: [
    block('seatFrame', 'frame', [WIDTH, 0.04, SEAT_END - HINGE], {
      at: [0, SEAT_Y - 0.05, round4((SEAT_END + HINGE) / 2 - MID)],
      round: 0.012,
      segments: 3,
    }),
    block('seatPad', 'cushion', [WIDTH - 0.06, 0.07, SEAT_END - HINGE - 0.04], {
      at: [0, SEAT_Y - 0.0, round4((SEAT_END + HINGE) / 2 - MID)],
      round: 0.03,
      segments: 3,
    }),
    ...backParts(),
    ...legs(),
    ...wheels(),
  ],
});

import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export const STAT_GAP = 12;

const STAT_COLUMN = 144;

const STAT_WELL = 36;

const DAY_ROW = 40;

const DAY_GAP = 2;

export interface Box {
  readonly width: number;
  readonly height: number;
}

export function statHeight(idiom: Idiom, captioned: boolean): number {
  const type = TYPE_SCALE[idiom];
  const caption = captioned ? type.caption[1] : 0;
  return Math.max(STAT_WELL, type.caption[1] + type['figure-s'][1] + caption);
}

export function statColumns(width: number): number {
  return Math.max(0, Math.floor((width + STAT_GAP) / (STAT_COLUMN + STAT_GAP)));
}

export function statCapacity(box: Box, idiom: Idiom, captioned: boolean): number {
  const rows = Math.floor((box.height + STAT_GAP) / (statHeight(idiom, captioned) + STAT_GAP));
  return statColumns(box.width) * Math.max(0, rows);
}

export function dayCapacity(height: number): number {
  return Math.max(0, Math.floor((height + DAY_GAP) / (DAY_ROW + DAY_GAP)));
}

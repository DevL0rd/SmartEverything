import { photoFlags, type PhotoFlag } from '@smarteverything/domain';
import { DAY_MS, MINUTE_MS } from '../../format/time';
import type { MediaTile } from './tiles';

const ASPECTS = [1.5, 0.75, 1.33, 1.78, 1, 0.5625, 1.2, 2.4] as const;

const THUMBHASHES = [
  '3OcRJYB4d3h/iIeHeEh3eIhw+j3A',
  'HBkSHYSIeHiPiHh8eJd4eTN0EEQG',
  'VvYRNQRod313B4h3eHhYiHeAiQUo',
  '1QcSHQRnh493V4dIh4eXh1h4kJUI',
] as const;

const FLAG_SETS: readonly (readonly PhotoFlag[])[] = [
  [],
  ['live'],
  [],
  ['favourite'],
  ['video'],
  [],
  ['stack'],
  [],
  ['processing'],
  [],
  ['video', 'favourite'],
  [],
  ['unreadable'],
];

export const FIXTURE_START = Date.UTC(2026, 10, 7, 18, 0);

function pick<T>(list: readonly T[], index: number): T {
  const value = list[index % list.length];
  if (value === undefined) throw new RangeError('A fixture list cannot be empty');
  return value;
}

export function fixtureTile(index: number, perDay: number): MediaTile {
  const flags = pick(FLAG_SETS, index);
  const day = Math.floor(index / perDay);
  const takenAt = FIXTURE_START - day * DAY_MS - (index % perDay) * 7 * MINUTE_MS;
  return {
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    rev: 1,
    aspect: pick(ASPECTS, index * 7),
    takenAt,
    offsetMin: 0,
    durationMs: flags.includes('video') ? 4_000 + (index % 90) * 1_000 : null,
    thumbhash: pick(THUMBHASHES, index),
    flags: photoFlags(flags),
    local: index % 17 === 5,
  };
}

export function fixtureTiles(total: number, perDay = 23): readonly MediaTile[] {
  return Array.from({ length: total }, (_, index) => fixtureTile(index, perDay));
}

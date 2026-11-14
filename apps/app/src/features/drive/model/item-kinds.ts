import type { DriveStats } from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';

export type DriveStatsKind = DriveStats['kinds'][number];

export type ItemKind = DriveStatsKind['kind'];

export const KIND_COLOUR: Readonly<Record<ItemKind, ColourRole>> = {
  image: 'viz-1',
  video: 'viz-3',
  document: 'viz-6',
  audio: 'viz-4',
  other: 'track',
};

export const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other',
};

export function itemsTextOf(items: number): string {
  return `${count(items)} ${items === 1 ? 'file' : 'files'}`;
}

export function kindSegmentsOf(kinds: readonly DriveStatsKind[]): readonly BarSegment[] {
  return kinds.map((kind) => ({
    label: KIND_LABEL[kind.kind],
    value: kind.bytes,
    colour: KIND_COLOUR[kind.kind],
  }));
}

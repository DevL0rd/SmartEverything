import type { DriveItem, DriveOfflineItem } from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { KIND_LOOK } from '../recent/recent-model';

export const FILES_APP_LINE =
  'SmartEverything shows in the Files app and in every file picker while this phone is paired with the Hub. Files kept here open without a connection.';

export const NOT_LINKED_LINE =
  'The Files app link starts once this phone is paired with the Hub and the app is up to date.';

export interface PhoneRowLine {
  readonly itemId: string;
  readonly name: string;
  readonly icon: IconName;
  readonly line: string;
  readonly tone: Tone;
}

const SEGMENT_COLOURS: readonly ColourRole[] = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
];

export function phoneRowLineOf(row: DriveOfflineItem, item: DriveItem | undefined): PhoneRowLine {
  const name = item?.name ?? 'A file you can no longer open';
  const icon = item === undefined ? 'ban' : KIND_LOOK[item.kind].icon;
  switch (row.state) {
    case 'ready':
      return {
        itemId: row.itemId,
        name,
        icon,
        line: `Kept · ${bytes(row.bytes)}`,
        tone: 'variant',
      };
    case 'waiting':
      return { itemId: row.itemId, name, icon, line: 'Copying to this phone', tone: 'info' };
    case 'failed':
      return {
        itemId: row.itemId,
        name,
        icon,
        line: `Not copied: ${row.error ?? 'the copy failed'}`,
        tone: 'critical',
      };
  }
}

export function phoneSegmentsOf(
  rows: readonly DriveOfflineItem[],
  nameOf: (itemId: string) => string,
): readonly BarSegment[] {
  return [...rows]
    .filter((row) => row.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes)
    .map((row, index) => ({
      label: nameOf(row.itemId),
      value: row.bytes,
      colour: SEGMENT_COLOURS[index % SEGMENT_COLOURS.length] ?? 'viz-1',
    }));
}

export function phoneSummaryOf(
  rows: readonly DriveOfflineItem[],
  usedBytes: number | null,
): string {
  const kept = rows.length === 1 ? '1 item kept' : `${count(rows.length)} items kept`;
  const used = usedBytes ?? rows.reduce((sum, row) => sum + row.bytes, 0);
  return `${kept} · ${bytes(used)} on this phone`;
}

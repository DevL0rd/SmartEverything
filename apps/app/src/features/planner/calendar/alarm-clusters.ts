import type { ClockFormat } from '../../../format/clock-text';
import { yOf, type AlarmPin } from './time-grid-layout';

export const PILL_HEIGHT = 20;

const PILL_GAP = 2;

export interface AlarmCluster {
  readonly key: string;
  readonly minute: number;
  readonly pins: readonly AlarmPin[];
}

export function alarmClustersOf(
  pins: readonly AlarmPin[],
  hourHeight: number,
): readonly AlarmCluster[] {
  const sorted = [...pins].sort((left, right) => left.minute - right.minute);
  const clusters: AlarmPin[][] = [];
  for (const pin of sorted) {
    const current = clusters.at(-1);
    const last = current?.at(-1);
    if (
      current !== undefined &&
      last !== undefined &&
      yOf(pin.minute, hourHeight) - yOf(last.minute, hourHeight) < PILL_HEIGHT + PILL_GAP
    ) {
      current.push(pin);
    } else {
      clusters.push([pin]);
    }
  }
  return clusters.flatMap((group) => {
    const first = group[0];
    return first === undefined ? [] : [{ key: first.key, minute: first.minute, pins: group }];
  });
}

export function clusterText(cluster: AlarmCluster, compact: boolean, format: ClockFormat): string {
  const [first] = cluster.pins;
  if (first === undefined) return '';
  const time = format.text(first.time);
  if (cluster.pins.length === 1) {
    return compact || first.label === null ? time : `${time} ${first.label}`;
  }
  const more = `+${String(cluster.pins.length - 1)}`;
  return compact ? `${time} ${more}` : `${time} ${more} more`;
}

export function clusterLabel(cluster: AlarmCluster, format: ClockFormat): string {
  const names = cluster.pins.map(
    (pin) => `${format.text(pin.time)}${pin.label === null ? '' : ` ${pin.label}`}`,
  );
  const noun = cluster.pins.length === 1 ? 'Alarm' : 'Alarms';
  return `${noun} ${names.join(', ')}, opens Clock`;
}

export const TEXT_PILL_FROM = 180;

export const ICON_PILL = PILL_HEIGHT;

const PILL_EDGE = 2;

export interface PillBand {
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
}

export function pillTopOf(cluster: AlarmCluster, hourHeight: number): number {
  const line = yOf(cluster.minute, hourHeight);
  return line < PILL_HEIGHT ? line + 4 : line - PILL_HEIGHT - PILL_EDGE;
}

export function pillBandOf(cluster: AlarmCluster, hourHeight: number, width: number): PillBand {
  const top = pillTopOf(cluster, hourHeight);
  return { top, bottom: top + PILL_HEIGHT, right: PILL_EDGE + width + PILL_EDGE };
}

export const MIN_BLOCK_ROOM = 48;

export function laneInsetOf(
  block: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly width: number;
  },
  bands: readonly PillBand[],
): number {
  const inset = bands.reduce(
    (most, band) =>
      block.top < band.bottom && band.top < block.bottom
        ? Math.max(most, band.right - block.left)
        : most,
    0,
  );
  return block.width - inset < MIN_BLOCK_ROOM ? 0 : inset;
}

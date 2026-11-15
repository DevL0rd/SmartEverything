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

export function clusterText(cluster: AlarmCluster, compact: boolean): string {
  const [first] = cluster.pins;
  if (first === undefined) return '';
  if (cluster.pins.length === 1) {
    return compact || first.label === null ? first.time : `${first.time} ${first.label}`;
  }
  const more = `+${String(cluster.pins.length - 1)}`;
  return compact ? `${first.time} ${more}` : `${first.time} ${more} more`;
}

export function clusterLabel(cluster: AlarmCluster): string {
  const names = cluster.pins.map(
    (pin) => `${pin.time}${pin.label === null ? '' : ` ${pin.label}`}`,
  );
  const noun = cluster.pins.length === 1 ? 'Alarm' : 'Alarms';
  return `${noun} ${names.join(', ')}, opens Clock`;
}

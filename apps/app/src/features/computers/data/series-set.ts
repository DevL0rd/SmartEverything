import { useMemo } from 'react';
import type { ChartPoint } from '../../../components/charts';
import { usePausable } from '../../../design/external-store';
import { useScopeVisible } from '../../../design/visibility';
import { computerRings, type SeriesRing } from '../../../store/computer-rings';

type Lists = readonly (readonly ChartPoint[])[];

const NONE: Lists = [];

function notSubscribed(): () => void {
  return (): void => undefined;
}

class RingSet {
  private last: Lists = NONE;

  constructor(private readonly rings: readonly SeriesRing[]) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    const stops = this.rings.map((ring) => ring.subscribe(listener));
    return (): void => {
      stops.forEach((stop) => {
        stop();
      });
    };
  };

  readonly read = (): Lists => {
    const next = this.rings.map((ring) => ring.points());
    const same =
      next.length === this.last.length &&
      next.every((points, index) => points === this.last[index]);
    if (!same) this.last = next;
    return this.last;
  };
}

export function useSeriesSet(deviceId: string, ids: readonly string[]): Lists {
  const key = ids.join('\n');
  const set = useMemo(
    () =>
      new RingSet(key === '' ? [] : key.split('\n').map((id) => computerRings.ring(deviceId, id))),
    [deviceId, key],
  );
  const visible = useScopeVisible();
  return usePausable(visible ? set.subscribe : notSubscribed, set.read);
}

export function sumPoints(lists: Lists): readonly ChartPoint[] {
  const totals = new Map<number, number>();
  for (const points of lists) {
    for (const { t, v } of points) totals.set(t, (totals.get(t) ?? 0) + v);
  }
  return [...totals].sort(([left], [right]) => left - right).map(([t, v]) => ({ t, v }));
}

export function maxPoints(lists: Lists): readonly ChartPoint[] {
  const tops = new Map<number, number>();
  for (const points of lists) {
    for (const { t, v } of points) tops.set(t, Math.max(tops.get(t) ?? v, v));
  }
  return [...tops].sort(([left], [right]) => left - right).map(([t, v]) => ({ t, v }));
}

export function newestOf(lists: Lists): number | null {
  const times = lists.flatMap((points) => {
    const last = points.at(-1);
    return last === undefined ? [] : [last.t];
  });
  return times.length === 0 ? null : Math.max(...times);
}

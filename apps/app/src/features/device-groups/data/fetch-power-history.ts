import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import {
  bucketChanges,
  changesByDevice,
  stateBefore,
  windowAt,
  type PowerChange,
  type Window,
} from '../model/lanes';

const ROW_LIMIT = 20_000;
const LOOKBACK_MS = 31 * DAY_MS;
const SECOND_MS = 1000;

export interface PowerHistory {
  readonly changes: ReadonlyMap<string, readonly PowerChange[]>;
  readonly before: ReadonlyMap<string, boolean>;
  readonly at: number;
}

function iso(moment: number): string {
  return new Date(moment).toISOString();
}

export async function fetchPowerHistory(
  keys: ReadonlyMap<string, string>,
  window: Window,
): Promise<PowerHistory> {
  const at = Date.now();
  const { from } = windowAt(window, at);
  const keyOf = (deviceId: string): string | undefined => keys.get(deviceId);
  const series = { capabilities: [...new Set(keys.values())], deviceIds: [...keys.keys()] };
  if (window === 'week') {
    const buckets = await api().call(E.readHistoryBuckets, {
      query: {
        ...series,
        from: iso(from - LOOKBACK_MS),
        to: iso(at),
        bucketSeconds: HOUR_MS / SECOND_MS,
      },
    });
    return {
      changes: bucketChanges(buckets, keyOf, from),
      before: stateBefore(buckets, keyOf, from),
      at,
    };
  }
  const [rows, lookback] = await Promise.all([
    api().call(E.readHistory, { query: { ...series, from: iso(from), limit: ROW_LIMIT } }),
    api().call(E.readHistoryBuckets, {
      query: {
        ...series,
        from: iso(from - LOOKBACK_MS),
        to: iso(from),
        bucketSeconds: LOOKBACK_MS / SECOND_MS,
      },
    }),
  ]);
  return { changes: changesByDevice(rows, keyOf), before: stateBefore(lookback, keyOf, from), at };
}

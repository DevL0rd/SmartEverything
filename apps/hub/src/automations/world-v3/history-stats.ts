import {
  isSampledCapability,
  localClock,
  shiftedDate,
  zonedInstant,
  type HistoryBucket,
} from '@smarteverything/domain';
import { z } from 'zod';
import { controlKey, controlValue, readableControl } from './device-reads';
import { parseInputs } from './inputs';
import {
  ReadFailure,
  outputsOf,
  type ReadHandlers,
  type ReadInputs,
  type ReadResult,
} from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';
import { homeZone } from './zone';
import type { WorldReadDeps } from './deps';

const EPOCH = '1970-01-01T00:00:00.000Z';
const BUCKET_SECONDS = 60;
const HOUR_MS = 3_600_000;
const DAY_DAYS = 1;
const WEEK_DAYS = 7;

const WINDOW_STATS = z.object({
  device: DEVICE_REF,
  control: z.string().min(1),
  window: z.number().positive(),
});

const COMPARE_PAST = z.object({
  device: DEVICE_REF,
  control: z.string().min(1),
  mode: z.enum(['ago', 'yesterday', 'last_week']).default('ago'),
  ago: z.number().positive().optional(),
});

function combined(buckets: readonly HistoryBucket[]): Readonly<Record<string, number>> {
  const counted = buckets.filter((bucket) => bucket.average !== null);
  const total = counted.reduce((sum, bucket) => sum + bucket.count, 0);
  const first = counted[0];
  const last = counted.at(-1);
  if (first === undefined || last === undefined || total === 0) return {};
  const weighted = counted.reduce((sum, bucket) => sum + (bucket.average ?? 0) * bucket.count, 0);
  const hours = (Date.parse(last.bucket_start) - Date.parse(first.bucket_start)) / HOUR_MS;
  return {
    average: weighted / total,
    min: Math.min(...counted.map((bucket) => bucket.minimum ?? Infinity)),
    max: Math.max(...counted.map((bucket) => bucket.maximum ?? -Infinity)),
    ...(hours > 0 ? { rate: ((last.average ?? 0) - (first.average ?? 0)) / hours } : {}),
  };
}

function earlierInstant(request: z.output<typeof COMPARE_PAST>, now: Date, zone: string): number {
  if (request.mode === 'ago') {
    if (request.ago === undefined) {
      throw new ReadFailure('Invalid', 'Compared with a while ago needs a time to look back');
    }
    return now.getTime() - request.ago;
  }
  const clock = localClock(now, zone);
  const days = request.mode === 'yesterday' ? DAY_DAYS : WEEK_DAYS;
  return zonedInstant(shiftedDate(clock, -days), clock.minuteOfDay, zone).getTime();
}

function windowStats(deps: WorldReadDeps, inputs: ReadInputs): ReadResult {
  const request = parseInputs('state.window_stats', WINDOW_STATS, inputs);
  const device = deviceById(deps.store, request.device);
  readableControl(device, request.control);
  const to = deps.clock.now().getTime();
  const buckets = deps.store.state.buckets({
    capabilities: [controlKey(request.control)],
    deviceIds: [device.id],
    from: new Date(to - request.window).toISOString(),
    to: new Date(to).toISOString(),
    bucketSeconds: BUCKET_SECONDS,
  });
  return outputsOf({
    ...combined(buckets),
    count: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  });
}

function comparePast(deps: WorldReadDeps, inputs: ReadInputs): ReadResult {
  const request = parseInputs('state.compare_past', COMPARE_PAST, inputs);
  const device = deviceById(deps.store, request.device);
  readableControl(device, request.control);
  const key = controlKey(request.control);
  if (isSampledCapability(key)) {
    throw new ReadFailure('Invalid', `${request.control} is sampled, so it has no change history`);
  }
  const current = controlValue(deps, device, key);
  if (typeof current !== 'number') {
    throw new ReadFailure('TypeError', `${request.control} of ${device.name} is not a number`);
  }
  const moment = earlierInstant(request, deps.clock.now(), homeZone(deps.store));
  const [row] = deps.store.state.history({
    capabilities: [key],
    deviceIds: [device.id],
    from: EPOCH,
    to: new Date(moment).toISOString(),
    order: 'desc',
    limit: 1,
  });
  const earlier = typeof row?.value === 'number' ? row.value : undefined;
  return outputsOf({
    current,
    earlier,
    change: earlier === undefined ? undefined : current - earlier,
  });
}

export function historyStatsHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'state.window_stats': (inputs) => windowStats(deps, inputs),
    'state.compare_past': (inputs) => comparePast(deps, inputs),
  };
}

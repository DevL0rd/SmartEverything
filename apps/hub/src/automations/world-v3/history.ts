import {
  JSON_VALUE,
  isSampledCapability,
  jsonEquals,
  type HistoryRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { controlKey, readableControl } from './device-reads';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';
import type { WorldReadDeps } from './deps';

const EPOCH = '1970-01-01T00:00:00.000Z';

const MOMENT = z.iso.datetime({ offset: true });

const HISTORY = z.object({
  device: DEVICE_REF,
  control: z.string().min(1),
  last: z.number().nonnegative().optional(),
  from: MOMENT.optional(),
  to: MOMENT.optional(),
  stateEquals: JSON_VALUE.optional(),
});

interface Range {
  readonly start: number;
  readonly end: number;
}

function rangeOf(request: z.output<typeof HISTORY>, now: Date): Range {
  const end = request.to === undefined ? now.getTime() : Date.parse(request.to);
  if (request.from !== undefined && request.last !== undefined) {
    throw new ReadFailure('Invalid', 'Give either a start moment or a look-back time, not both');
  }
  const start =
    request.from !== undefined
      ? Date.parse(request.from)
      : request.last !== undefined
        ? end - request.last
        : undefined;
  if (start === undefined) {
    throw new ReadFailure('Invalid', 'History needs a look-back time or a start moment');
  }
  if (start > end) throw new ReadFailure('Invalid', 'The history range ends before it starts');
  return { start, end };
}

function timeIn(
  points: readonly HistoryRow[],
  carried: JsonValue | undefined,
  range: Range,
  target: JsonValue,
): number {
  const steps = [
    ...(carried === undefined ? [] : [{ at: range.start, value: carried }]),
    ...points.map((row) => ({ at: Date.parse(row.observed_at), value: row.value })),
  ];
  return steps.reduce((total, step, index) => {
    const until = steps[index + 1]?.at ?? range.end;
    return jsonEquals(step.value, target) ? total + (until - step.at) : total;
  }, 0);
}

function statistics(points: readonly HistoryRow[]): Readonly<Record<string, number>> {
  const values = points.flatMap((row) => (typeof row.value === 'number' ? [row.value] : []));
  const first = values[0];
  const last = values.at(-1);
  if (first === undefined || last === undefined) return {};
  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    change: last - first,
  };
}

export function historyHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'state.history': (inputs): ReadResult => {
      const request = parseInputs('state.history', HISTORY, inputs);
      const device = deviceById(deps.store, request.device);
      readableControl(device, request.control);
      const key = controlKey(request.control);
      if (isSampledCapability(key)) {
        throw new ReadFailure(
          'Invalid',
          `${request.control} is sampled, so it has no change history`,
        );
      }
      const range = rangeOf(request, deps.clock.now());
      const series = { capabilities: [key], deviceIds: [device.id] };
      const points = deps.store.state.history({
        ...series,
        from: new Date(range.start).toISOString(),
        to: new Date(range.end).toISOString(),
        order: 'asc',
        limit: Number.MAX_SAFE_INTEGER,
      });
      const carried = deps.store.state.history({
        ...series,
        from: EPOCH,
        to: new Date(range.start).toISOString(),
        order: 'desc',
        limit: 1,
      })[0]?.value;
      return outputsOf({
        points: points.map((row) => ({ at: row.observed_at, value: row.value })),
        ...statistics(points),
        count: points.length,
        timeIn:
          request.stateEquals === undefined
            ? undefined
            : timeIn(points, carried, range, request.stateEquals),
      });
    },
  };
}

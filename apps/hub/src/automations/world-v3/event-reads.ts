import { EVENT_KINDS, type EventRow, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { WorldReadDeps } from './deps';
import { parseInputs } from './inputs';
import {
  outputsOf,
  type ReadHandlers,
  type ReadInputs,
  type ReadResult,
  type ReadScope,
} from './read-port';
import { TARGET_VALUE } from './refs';
import { devicesOf } from './targets';

const EVENT_COUNT = z.object({
  target: TARGET_VALUE.optional(),
  kinds: z.array(z.enum(EVENT_KINDS)).default([]),
  last: z.number().positive(),
});

function recordOf(row: EventRow): Readonly<Record<string, JsonValue>> {
  return {
    id: row.id,
    ...(row.device_id === null ? {} : { device: { device: row.device_id } }),
    kind: row.kind,
    at: row.occurred_at,
    details: row.details,
  };
}

function eventCount(deps: WorldReadDeps, inputs: ReadInputs, scope: ReadScope): ReadResult {
  const request = parseInputs('event.count', EVENT_COUNT, inputs);
  const deviceIds =
    request.target === undefined
      ? undefined
      : devicesOf(deps.world, request.target).map((device) => device.id);
  const rows =
    deviceIds?.length === 0
      ? []
      : scope.fetch('worldEvents', {
          from: new Date(scope.now().getTime() - request.last).toISOString(),
          ...(deviceIds === undefined ? {} : { deviceIds }),
          kinds: request.kinds,
          limit: Number.MAX_SAFE_INTEGER,
        });
  return outputsOf({
    count: rows.length,
    latest: rows[0]?.occurred_at,
    events: rows.map(recordOf),
  });
}

export function eventReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'event.count': (inputs, scope): ReadResult => eventCount(deps, inputs, scope),
  };
}

import { EVENT_KINDS } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { MOMENT_ARGUMENT, READS, ToolError, defineTool, type Tool } from './registry';
import { capabilityOf, placedDevice, placedDevices } from './targets';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 92;

const BUCKET_SECONDS = { minute: 60, hour: 3600, day: 86_400 } as const;

const HISTORY = z
  .strictObject({
    deviceId: z.uuid(),
    capability: z.string().min(1).describe('Capability key, role or label'),
    from: MOMENT_ARGUMENT.describe('Start of the range, ISO 8601 with offset'),
    to: MOMENT_ARGUMENT.describe('End of the range, ISO 8601 with offset'),
    bucket: z
      .enum(['raw', 'minute', 'hour', 'day'])
      .default('raw')
      .describe('raw for every change; minute, hour or day to average numbers per bucket'),
    limit: z.number().int().min(1).max(1000).default(500),
  })
  .refine((range) => range.from < range.to, { message: 'from must be before to' })
  .refine((range) => Date.parse(range.to) - Date.parse(range.from) <= HISTORY_DAYS * DAY_MS, {
    message: `the range must not exceed ${String(HISTORY_DAYS)} days`,
  });

type History = z.infer<typeof HISTORY>;

const EVENTS = z.strictObject({
  deviceIds: z.array(z.uuid()).min(1).optional().describe('Only events of these devices'),
  kinds: z.array(z.enum(EVENT_KINDS)).min(1).optional(),
  since: MOMENT_ARGUMENT.optional().describe('Only events at or after this moment'),
  until: MOMENT_ARGUMENT.optional().describe('Only events before this moment, to page back'),
  limit: z.number().int().min(1).max(200).default(50),
});

type Events = z.infer<typeof EVENTS>;

function history(store: Store, input: History): Record<string, unknown> {
  const presented = capabilityOf(placedDevice(store, input.deviceId), input.capability);
  const kind = presented.capability.value.kind;
  const series = {
    capabilities: [presented.key],
    deviceIds: [input.deviceId],
    from: input.from,
    to: input.to,
  };
  if (input.bucket === 'raw') {
    const points = store.state
      .history({ ...series, order: 'asc', limit: input.limit })
      .map((row) => ({ value: row.value, observed_at: row.observed_at }));
    return {
      capability: presented.key,
      label: presented.label,
      unit: presented.unit,
      kind,
      bucket: 'raw',
      points,
    };
  }
  if (kind !== 'number') {
    throw new ToolError(
      `${presented.label} holds ${kind} values; only numbers can be bucketed, use raw`,
    );
  }
  const points = store.state
    .buckets({ ...series, bucketSeconds: BUCKET_SECONDS[input.bucket] })
    .slice(0, input.limit)
    .map((row) => ({
      bucket: row.bucket_start,
      average: row.average,
      minimum: row.minimum,
      maximum: row.maximum,
      samples: row.count,
    }));
  return {
    capability: presented.key,
    label: presented.label,
    unit: presented.unit,
    kind,
    bucket: input.bucket,
    points,
  };
}

function recordingsOf(store: Store, eventId: string): Record<string, unknown>[] {
  return store.cameras.recordingsOfEvent(eventId).map((recording) => ({
    id: recording.id,
    kind: recording.kind,
    started_at: recording.started_at,
  }));
}

function events(store: Store, input: Events): Record<string, unknown>[] {
  const placed = new Map(placedDevices(store).map((entry) => [entry.device.id, entry]));
  return store.events
    .list({
      from: input.since,
      to: input.until,
      deviceIds: input.deviceIds,
      kinds: input.kinds,
      limit: input.limit,
    })
    .map((event) => {
      const where = event.device_id === null ? undefined : placed.get(event.device_id);
      return {
        id: event.id,
        device_id: event.device_id,
        device: where === undefined ? null : where.name,
        room: where?.room?.name ?? null,
        kind: event.kind,
        occurred_at: event.occurred_at,
        details: event.details,
        acknowledged_at: event.acknowledged_at,
        recordings: recordingsOf(store, event.id),
      };
    });
}

export const HISTORY_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'get_history',
    input: HISTORY,
    annotations: READS,
    run: ({ store }, input) => ({ structured: history(store, input) }),
  }),
  defineTool({
    name: 'list_events',
    input: EVENTS,
    annotations: READS,
    run: ({ store }, input) => ({ structured: { events: events(store, input) } }),
  }),
];

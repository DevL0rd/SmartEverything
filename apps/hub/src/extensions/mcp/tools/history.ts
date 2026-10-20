import {
  EVENT_KINDS,
  appendTo,
  type DeviceScope,
  type RecordingRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PhoneViewer } from '../../../phones/phone-detail';
import { visibleEvents, visibleRows } from '../../../phones/phone-visibility';
import type { Store } from '../../../store/store';
import { deviceScopeOfActor, phoneViewerOfActor } from './person-reach';
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

export type History = z.infer<typeof HISTORY>;

const EVENTS = z.strictObject({
  deviceIds: z.array(z.uuid()).min(1).optional().describe('Only events of these devices'),
  kinds: z.array(z.enum(EVENT_KINDS)).min(1).optional(),
  source: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Only home events (kind "signal") from this signal source, e.g. hub or plugin_router',
    ),
  signalKind: z
    .string()
    .min(1)
    .optional()
    .describe('Only home events (kind "signal") of this signal kind, e.g. client_joined'),
  since: MOMENT_ARGUMENT.optional().describe('Only events at or after this moment'),
  until: MOMENT_ARGUMENT.optional().describe('Only events before this moment, to page back'),
  limit: z.number().int().min(1).max(200).default(50),
});

export type Events = z.infer<typeof EVENTS>;

export function historyOf(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  input: History,
): Record<string, unknown> {
  const presented = capabilityOf(placedDevice(store, scope, input.deviceId), input.capability);
  const kind = presented.capability.value.kind;
  const series = {
    capabilities: [presented.key],
    deviceIds: [input.deviceId],
    from: input.from,
    to: input.to,
  };
  if (input.bucket === 'raw') {
    const points = visibleRows(
      store,
      viewer,
      store.state.history({ ...series, order: 'asc', limit: input.limit }),
    ).map((row) => ({ value: row.value, observed_at: row.observed_at }));
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
  const points = bucketedPoints(store, viewer, series, input);
  return {
    capability: presented.key,
    label: presented.label,
    unit: presented.unit,
    kind,
    bucket: input.bucket,
    points,
  };
}

interface Series {
  readonly capabilities: string[];
  readonly deviceIds: string[];
  readonly from: string;
  readonly to: string;
}

function bucketedPoints(
  store: Store,
  viewer: PhoneViewer,
  series: Series,
  input: History,
): Record<string, unknown>[] {
  if (input.bucket === 'raw') return [];
  return visibleRows(
    store,
    viewer,
    store.state.buckets({ ...series, bucketSeconds: BUCKET_SECONDS[input.bucket] }),
  )
    .slice(0, input.limit)
    .map((row) => ({
      bucket: row.bucket_start,
      average: row.average,
      minimum: row.minimum,
      maximum: row.maximum,
      samples: row.count,
    }));
}

function recordingsByEvent(store: Store, eventIds: readonly string[]): Map<string, RecordingRow[]> {
  const grouped = new Map<string, RecordingRow[]>();
  for (const recording of store.cameras.recordingsOfEvents(eventIds)) {
    const eventId = recording.event_id;
    if (eventId !== null) {
      appendTo(grouped, eventId, recording);
    }
  }
  return grouped;
}

export function eventsOf(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  input: Events,
): Record<string, unknown>[] {
  const placed = new Map(placedDevices(store, scope).map((entry) => [entry.device.id, entry]));
  const everything = store.events.list({
    from: input.since,
    to: input.until,
    deviceIds: input.deviceIds,
    kinds: input.kinds,
    signal: { source: input.source, kind: input.signalKind },
    limit: input.limit,
  });
  const listed = visibleEvents(
    store,
    viewer,
    everything.filter(
      (event) => scope === null || event.device_id === null || placed.has(event.device_id),
    ),
  );
  const recordings = recordingsByEvent(
    store,
    listed.map((event) => event.id),
  );
  return listed.map((event) => {
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
      recordings: (recordings.get(event.id) ?? []).map((recording) => ({
        id: recording.id,
        kind: recording.kind,
        started_at: recording.started_at,
      })),
    };
  });
}

export const HISTORY_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'get_history',
    input: HISTORY,
    annotations: READS,
    run: (context, input) => ({
      structured: historyOf(
        context.store,
        deviceScopeOfActor(context),
        phoneViewerOfActor(context),
        input,
      ),
    }),
  }),
  defineTool({
    name: 'list_events',
    input: EVENTS,
    annotations: READS,
    run: (context, input) => ({
      structured: {
        events: eventsOf(
          context.store,
          deviceScopeOfActor(context),
          phoneViewerOfActor(context),
          input,
        ),
      },
    }),
  }),
];

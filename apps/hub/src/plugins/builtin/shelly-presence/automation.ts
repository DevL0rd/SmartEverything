import type { PluginTrigger } from '@smarteverything/domain';
import { SHELLY_PLUGIN_ID } from '@smarteverything/shelly';
import { z } from 'zod';
import {
  actionNode,
  automation,
  entity,
  eventTrigger,
  input,
  ports,
  streamValue,
  type DeviceEventRef,
  type PortKind,
} from '../automation-kit';

export const SHELLY_SENSOR_PICKER = 'sensors';

export const SHELLY_ZONE_PICKER = 'zones';

export const SHELLY_ZONES_STREAM = `${SHELLY_PLUGIN_ID}.zones`;

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

export const SHELLY_SENSOR = entity(SHELLY_PLUGIN_ID, {
  id: 'sensor',
  title: 'Shelly Presence sensor',
  plural: 'Shelly Presence sensors',
  options: SHELLY_SENSOR_PICKER,
});

export const SHELLY_ZONE = entity(SHELLY_PLUGIN_ID, {
  id: 'zone',
  title: 'Presence zone',
  plural: 'Presence zones',
  options: SHELLY_ZONE_PICKER,
});

export const LIVE_VIEW_TOOL = {
  name: 'set_live_view',
  input: z.strictObject({
    externalId: z.string().min(1),
    enabled: z.boolean(),
    holder: z.string().min(1).optional(),
  }),
};

export const SENSOR_EVENT_FIELD = 'parentExternalId';

export const ZONE_EVENT_FIELD = 'zone';

const ROOM_EVENT_FIELD = 'roomId';

const INSTANT: PortKind<string> = { type: { t: 'instant' } };

const KEYWORDS = ['shelly', 'presence', 'radar', 'zone', 'sensor'];

interface Crossing {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly someone: string;
  readonly keywords: readonly string[];
}

function crossing(deviceEvent: DeviceEventRef['deviceEvent'], spec: Crossing): PluginTrigger {
  return eventTrigger({
    id: spec.id,
    version: 1,
    title: spec.title,
    description: `Runs when a Shelly Presence sensor sees ${spec.someone}. Choose a sensor to react to all its zones, or a zone to react to only that one.`,
    icon: 'radar',
    keywords: [...KEYWORDS, ...spec.keywords],
    summary: spec.summary,
    event: { deviceEvent },
    filters: {
      sensor: {
        kind: SHELLY_SENSOR.kind,
        title: 'Sensor',
        description: 'Only zones of this sensor.',
        match: SENSOR_EVENT_FIELD,
      },
      zone: {
        kind: SHELLY_ZONE.kind,
        title: 'Zone',
        description: 'Only this zone.',
        match: ZONE_EVENT_FIELD,
      },
    },
    outputs: {
      zone: { kind: SHELLY_ZONE.kind, title: 'Zone', from: ZONE_EVENT_FIELD },
      sensor: { kind: SHELLY_SENSOR.kind, title: 'Sensor', from: SENSOR_EVENT_FIELD },
      room: { kind: ports.ref('room'), title: 'Room', from: ROOM_EVENT_FIELD },
      at: { kind: INSTANT, title: 'When', from: 'at' },
    },
  });
}

export const ZONE_ENTER_TRIGGER = crossing('zone_enter', {
  id: 'zone_enter',
  title: 'Someone enters a zone',
  summary: 'Someone enters {zone} of {sensor}',
  someone: 'someone step into a zone',
  keywords: ['enter', 'arrive', 'walk in'],
});

export const ZONE_LEAVE_TRIGGER = crossing('zone_leave', {
  id: 'zone_leave',
  title: 'Someone leaves a zone',
  summary: 'Someone leaves {zone} of {sensor}',
  someone: 'someone step out of a zone',
  keywords: ['leave', 'exit', 'walk out'],
});

export const LIVE_TRACKING_NODE = actionNode({
  id: 'live_tracking',
  version: 1,
  title: 'Keep live tracking on',
  description:
    'Keeps a Shelly Presence sensor reporting where people are, moment by moment, for as long as this automation needs it. Turn On off to let go; the sensor stops once nothing else needs it.',
  icon: 'radar',
  keywords: [...KEYWORDS, 'live', 'tracking', 'positions', 'map'],
  summary: 'Live tracking {on} on {sensor}',
  tool: LIVE_VIEW_TOOL,
  inputs: {
    sensor: input(SHELLY_SENSOR.kind, {
      title: 'Sensor',
      description: 'The Shelly Presence sensor to track.',
    }),
    on: input(ports.boolean(), {
      title: 'On',
      description: 'On keeps tracking running, off lets go.',
    }),
  },
  args: { externalId: { port: 'sensor' }, enabled: { port: 'on' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const ZONE_COUNT_VALUE = streamValue({
  id: 'zone_count',
  version: 1,
  title: 'People in a zone',
  description: 'Whether anyone is in a zone right now and how many people the sensor sees there.',
  icon: 'radar',
  keywords: [...KEYWORDS, 'people', 'count', 'occupied', 'objects'],
  summary: 'People in {zone}',
  inputs: {
    zone: input(SHELLY_ZONE.kind, { title: 'Zone', description: 'The zone to read.' }),
  },
  stream: SHELLY_ZONES_STREAM,
  select: { list: '/zones', key: '/id', port: 'zone' },
  outputs: {
    occupied: { kind: ports.boolean(), from: '/occupied' },
    count: { kind: ports.number({ integer: true, min: 0 }), from: '/count' },
  },
});

export const SHELLY_AUTOMATION = automation({
  nodes: [LIVE_TRACKING_NODE],
  triggers: [ZONE_ENTER_TRIGGER, ZONE_LEAVE_TRIGGER],
  values: [ZONE_COUNT_VALUE],
  entities: [SHELLY_SENSOR, SHELLY_ZONE],
});

import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  SHELLY_COMPONENT,
  SHELLY_DISCOVERED_BTHOME,
  SHELLY_LIGHT_STATUS,
  SHELLY_PRESENCE_STATUS,
  SHELLY_TRACK,
  SHELLY_ZONE_STATUS,
  type ShellyDevice,
} from '@smarteverything/shelly';
import type { ShellyNotification } from '@smarteverything/shelly/rpc';
import { z } from 'zod';

const EVENT = z.looseObject({
  component: z.string(),
  event: z.string(),
  ts: z.number().nonnegative(),
  value: JSON_VALUE.optional(),
  device: SHELLY_DISCOVERED_BTHOME.optional(),
  data: JSON_VALUE.optional(),
  num_objects: z.int().nonnegative().optional(),
  object: z.unknown().optional(),
});
const EVENTS = z.object({ events: z.array(z.unknown()) });
const STATUS = z.record(z.string(), JSON_VALUE);
const REVISED = z.object({ cfg_rev: z.int().optional() });
const TRACKS = z.array(SHELLY_TRACK);

export type ShellyEvent = z.output<typeof EVENT>;

export function shellyEvents(notification: ShellyNotification): readonly ShellyEvent[] {
  if (notification.method !== 'NotifyEvent') return [];
  const events = EVENTS.safeParse(notification.params);
  if (!events.success) return [];
  return events.data.events.flatMap((raw) => {
    const event = EVENT.safeParse(raw);
    return event.success ? [event.data] : [];
  });
}

function touched<T>(items: T[], isTouched: (item: T) => boolean, update: (item: T) => T): T[] {
  if (!items.some(isTouched)) return items;
  return items.map((item) => (isTouched(item) ? update(item) : item));
}

export function readingsChanged(before: ShellyDevice, after: ShellyDevice): boolean {
  return (
    before.zones !== after.zones ||
    before.light !== after.light ||
    before.status !== after.status ||
    before.components !== after.components
  );
}

function statusValue(previous: unknown, value: JsonValue | undefined, full: boolean): unknown {
  if (value === undefined) return previous;
  if (value === null) return null;
  const next = STATUS.parse(value);
  if (full) return next;
  return { ...(previous === null ? {} : STATUS.parse(previous)), ...next };
}

function statusSnapshot(
  snapshot: ShellyDevice,
  delta: Readonly<Record<string, JsonValue>>,
  keys: ReadonlySet<string>,
  full: boolean,
): ShellyDevice {
  const lightKey = (sensor: ShellyDevice['light'][number]): string =>
    `illuminance:${String(sensor.config.id)}`;
  return {
    ...snapshot,
    zones: touched(
      snapshot.zones,
      (zone) => keys.has(zone.key),
      (zone) => ({
        ...zone,
        status: SHELLY_ZONE_STATUS.nullable().parse(
          statusValue(zone.status, delta[zone.key], full),
        ),
      }),
    ),
    light: touched(
      snapshot.light,
      (sensor) => keys.has(lightKey(sensor)),
      (sensor) => ({
        ...sensor,
        status: SHELLY_LIGHT_STATUS.nullable().parse(
          statusValue(sensor.status, delta[lightKey(sensor)], full),
        ),
      }),
    ),
    status: keys.has('presence')
      ? SHELLY_PRESENCE_STATUS.nullable().parse(
          statusValue(snapshot.status, delta['presence'], full),
        )
      : snapshot.status,
    components: touched(
      snapshot.components,
      (component) => keys.has(component.key),
      (component) =>
        SHELLY_COMPONENT.parse({
          ...component,
          status: statusValue(component.status, delta[component.key], full),
        }),
    ),
    observedAt: new Date(z.number().nonnegative().parse(delta['ts']) * 1000).toISOString(),
  };
}

function trackSnapshot(snapshot: ShellyDevice, event: ShellyEvent): ShellyDevice | null {
  if (event.component !== 'presence') return null;
  const tracksAt = new Date(event.ts * 1000).toISOString();
  if (event.event === 'no_track') return { ...snapshot, tracks: [], tracksAt };
  if (event.event !== 'track') return null;
  return { ...snapshot, tracks: TRACKS.parse(event.object), tracksAt };
}

function zoneEventStatus(
  status: NonNullable<ShellyDevice['zones'][number]['status']>,
  event: ShellyEvent,
): NonNullable<ShellyDevice['zones'][number]['status']> {
  if (event.event === 'presence') return { ...status, value: z.boolean().parse(event.value) };
  return { ...status, num_objects: z.int().nonnegative().parse(event.num_objects) };
}

function eventSnapshot(
  snapshot: ShellyDevice,
  event: ShellyEvent,
  updateState: boolean,
): ShellyDevice {
  if (event.component === 'bthome' && event.event === 'device_discovered' && event.device) {
    const found = event.device;
    return {
      ...snapshot,
      discoveredBthome: [
        ...snapshot.discoveredBthome.filter((device) => device.addr !== found.addr),
        found,
      ],
    };
  }
  const tracked = trackSnapshot(snapshot, event);
  if (tracked !== null) return tracked;
  if (!updateState) return snapshot;
  const zones = touched(
    snapshot.zones,
    (zone) =>
      zone.key === event.component &&
      zone.status !== null &&
      (event.event === 'presence' || event.event === 'counter'),
    (zone) =>
      zone.status === null ? zone : { ...zone, status: zoneEventStatus(zone.status, event) },
  );
  return { ...snapshot, zones, observedAt: new Date(event.ts * 1000).toISOString() };
}

export function notificationSnapshot(
  snapshot: ShellyDevice,
  notification: ShellyNotification,
  events: readonly ShellyEvent[],
  updateState: boolean,
): ShellyDevice {
  if (notification.params === undefined) return snapshot;
  if (notification.method === 'NotifyEvent')
    return events.reduce((current, event) => eventSnapshot(current, event, updateState), snapshot);
  if (
    !updateState ||
    (notification.method !== 'NotifyStatus' && notification.method !== 'NotifyFullStatus')
  )
    return snapshot;
  const delta = notification.params;
  const keys = new Set(Object.keys(delta).filter((key) => key !== 'ts'));
  if (keys.size === 0) return snapshot;
  return statusSnapshot(snapshot, delta, keys, notification.method === 'NotifyFullStatus');
}

export function configurationChanged(
  notification: ShellyNotification,
  events: readonly ShellyEvent[],
  snapshot: ShellyDevice,
): boolean {
  if (events.some((event) => event.event === 'config_changed')) return true;
  const sys = REVISED.safeParse(notification.params?.['sys']);
  return sys.success && sys.data.cfg_rev !== undefined && sys.data.cfg_rev !== snapshot.revision;
}

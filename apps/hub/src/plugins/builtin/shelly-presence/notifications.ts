import {
  JSON_VALUE,
  SHELLY_COMPONENT,
  SHELLY_BTHOME_DISCOVERED,
  SHELLY_LIGHT_STATUS,
  SHELLY_PRESENCE_STATUS,
  SHELLY_TRACK,
  SHELLY_ZONE_STATUS,
  type JsonValue,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ShellyNotification } from './rpc-frames';

const EVENT = z.object({
  component: z.string().max(100),
  event: z.string().max(100),
  ts: z.number().nonnegative(),
  id: z.int().optional(),
  value: z.union([z.number(), z.boolean(), z.string().max(1024), z.null()]).optional(),
  device: SHELLY_BTHOME_DISCOVERED.optional(),
  data: JSON_VALUE.optional(),
  num_objects: z.int().nonnegative().optional(),
  object: z
    .union([z.array(SHELLY_TRACK).max(32), z.array(z.tuple([z.number(), z.number()])).max(32)])
    .optional(),
  restart_required: z.boolean().optional(),
});
export type ShellyStateUpdate = boolean | ((component: string) => boolean);
function updatesState(update: ShellyStateUpdate, component: string): boolean {
  return typeof update === 'boolean' ? update : update(component);
}
export type ShellyEvent = z.output<typeof EVENT>;
const EVENTS = z.object({ events: z.array(EVENT).max(128) });
export function shellyEvents(notification: ShellyNotification): readonly ShellyEvent[] {
  return notification.method === 'NotifyEvent' ? EVENTS.parse(notification.params).events : [];
}
export function notificationSnapshot(
  snapshot: ShellyPresenceDevice,
  notification: ShellyNotification,
  updateState: ShellyStateUpdate,
): ShellyPresenceDevice {
  if (notification.params === undefined) return snapshot;
  if (notification.method === 'NotifyEvent')
    return shellyEvents(notification).reduce(
      (current, event) => eventSnapshot(current, event, updatesState(updateState, event.component)),
      snapshot,
    );
  if (
    updateState === false ||
    (notification.method !== 'NotifyStatus' && notification.method !== 'NotifyFullStatus')
  )
    return snapshot;
  const delta = notification.params;
  if (!Object.keys(delta).some((key) => key !== 'ts' && updatesState(updateState, key)))
    return snapshot;
  const full = notification.method === 'NotifyFullStatus';
  const zones = snapshot.zones.map((zone) => ({
    ...zone,
    status: updatesState(updateState, zone.key)
      ? SHELLY_ZONE_STATUS.nullable().parse(statusValue(zone.status, delta[zone.key], full))
      : zone.status,
  }));
  const light = snapshot.light.map((sensor) => ({
    ...sensor,
    status: updatesState(updateState, `illuminance:${String(sensor.config.id)}`)
      ? SHELLY_LIGHT_STATUS.nullable().parse(
          statusValue(sensor.status, delta[`illuminance:${String(sensor.config.id)}`], full),
        )
      : sensor.status,
  }));
  const status = updatesState(updateState, 'presence')
    ? SHELLY_PRESENCE_STATUS.nullable().parse(statusValue(snapshot.status, delta['presence'], full))
    : snapshot.status;
  const components = snapshot.components.map((component) =>
    SHELLY_COMPONENT.parse({
      ...component,
      status: updatesState(updateState, component.key)
        ? statusValue(component.status, delta[component.key], full)
        : component.status,
    }),
  );
  return { ...snapshot, zones, light, status, components, observedAt: timestamp(delta['ts']) };
}
function record(value: JsonValue): Readonly<Record<string, JsonValue>> {
  return z.record(z.string(), JSON_VALUE).parse(value);
}
function statusValue(previous: unknown, value: JsonValue | undefined, full: boolean): unknown {
  if (value === undefined) return previous;
  if (value === null) return null;
  if (full) return record(value);
  const before = previous === null ? {} : z.record(z.string(), JSON_VALUE).parse(previous);
  return { ...before, ...record(value) };
}
function timestamp(value: JsonValue | undefined): string {
  return new Date(z.number().nonnegative().parse(value) * 1000).toISOString();
}
function eventSnapshot(
  snapshot: ShellyPresenceDevice,
  event: ShellyEvent,
  updateState: boolean,
): ShellyPresenceDevice {
  if (
    event.component === 'bthome' &&
    event.event === 'device_discovered' &&
    event.device !== undefined
  ) {
    const found = event.device;
    return {
      ...snapshot,
      discoveredBthome: [
        ...snapshot.discoveredBthome.filter((device) => device.addr !== found.addr),
        found,
      ].slice(-64),
    };
  }
  if (event.component === 'presence') {
    if (event.event === 'no_track')
      return { ...snapshot, tracks: [], tracksAt: new Date(event.ts * 1000).toISOString() };
    if (event.event === 'track')
      return {
        ...snapshot,
        tracks: z.array(SHELLY_TRACK).max(32).parse(event.object),
        tracksAt: new Date(event.ts * 1000).toISOString(),
      };
  }
  if (!updateState) return snapshot;
  const zones = snapshot.zones.map((zone) => {
    if (zone.key !== event.component || zone.status === null) return zone;
    if (event.event === 'presence')
      return { ...zone, status: { ...zone.status, value: z.boolean().parse(event.value) } };
    if (event.event === 'counter')
      return {
        ...zone,
        status: { ...zone.status, num_objects: z.int().nonnegative().parse(event.num_objects) },
      };
    return zone;
  });
  return { ...snapshot, zones, observedAt: new Date(event.ts * 1000).toISOString() };
}
export function configurationChanged(
  notification: ShellyNotification,
  snapshot: ShellyPresenceDevice,
): boolean {
  if (shellyEvents(notification).some((event) => event.event === 'config_changed')) return true;
  const sys = notification.params?.['sys'];
  const parsed = z.object({ cfg_rev: z.int().optional() }).safeParse(sys);
  return (
    parsed.success && parsed.data.cfg_rev !== undefined && parsed.data.cfg_rev !== snapshot.revision
  );
}

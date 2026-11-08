import { useMemo, useState } from 'react';
import type { ShellyDevice } from '@smarteverything/shelly';
import {
  TRACK_TRAIL_MS,
  type OverlaySensor,
  type OverlayTrack,
  type OverlayZone,
} from '../../../components/house-map/overlays/model-types';
import { isPhysicalPresence, useMapPresence } from '../../../plugins/shelly-presence/presence-data';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import type { LivePresence } from './live-feed-inputs';

export interface PlacedSensor {
  readonly deviceId: string;
  readonly externalId: string;
}

export const IDLE_PRESENCE: LivePresence = { sensors: [], trackingLease: false, now: 0 };

export function placedSensorsOf(
  state: StoreState,
  deviceIds: readonly string[],
): readonly PlacedSensor[] {
  return deviceIds.flatMap((deviceId) => {
    const device = state.tables.devices.byId[deviceId];
    return device !== undefined && isPhysicalPresence(device)
      ? [{ deviceId, externalId: device.external_id }]
      : [];
  });
}

export function zonesOf(sensor: ShellyDevice): readonly OverlayZone[] {
  return sensor.zones
    .filter((zone) => !zone.main && zone.config.enable !== false)
    .map((zone) => ({
      id: zone.externalId,
      area: zone.config.area ?? [],
      occupied: zone.status?.value === true,
    }));
}

function tracksOf(
  sensor: ShellyDevice,
  held: OverlaySensor | undefined,
  now: number,
): readonly OverlayTrack[] {
  const at = sensor.tracksAt === null ? null : Date.parse(sensor.tracksAt);
  if (at === null) return [];
  return sensor.tracks.map((track) => {
    const id = String(track.id);
    const past = held?.tracks.find((item) => item.id === id)?.points ?? [];
    const points = past.at(-1)?.at === at ? past : [...past, { x: track.x, y: track.y, at }];
    return { id, points: points.filter((point) => now - point.at <= TRACK_TRAIL_MS) };
  });
}

export function advancePresence(
  held: LivePresence,
  placed: readonly PlacedSensor[],
  sensors: readonly ShellyDevice[],
  tracking: boolean,
): LivePresence {
  const byExternal = new Map(sensors.map((sensor) => [sensor.externalId, sensor]));
  const now = sensors.reduce(
    (latest, sensor) =>
      sensor.tracksAt === null ? latest : Math.max(latest, Date.parse(sensor.tracksAt)),
    held.now,
  );
  const next: LivePresence = {
    now,
    trackingLease: tracking,
    sensors: placed.flatMap(({ deviceId, externalId }) => {
      const sensor = byExternal.get(externalId);
      if (sensor === undefined) return [];
      const before = held.sensors.find((item) => item.deviceId === deviceId);
      const tracks = tracking ? tracksOf(sensor, before, now) : [];
      return [{ deviceId, zones: zonesOf(sensor), tracks }];
    }),
  };
  return sameJson(next, held) ? held : next;
}

export function usePresenceFeed(deviceIds: readonly string[]): LivePresence {
  const placed = useStoreSelector((state) => placedSensorsOf(state, deviceIds), sameJson, [
    deviceIds,
  ]);
  const externalIds = useMemo(() => placed.map((sensor) => sensor.externalId), [placed]);
  const { sensors, tracking } = useMapPresence(externalIds);
  const [held, setHeld] = useState(IDLE_PRESENCE);
  const next = advancePresence(held, placed, sensors, tracking);
  if (next !== held) setHeld(next);
  return next;
}

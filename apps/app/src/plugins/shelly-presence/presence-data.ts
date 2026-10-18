import { useMemo } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import {
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT,
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS,
  SHELLY_TRACKS_STREAM,
  type ShellyDevice,
  type ShellySnapshot,
} from '@smarteverything/shelly';
import { memoOnInputs } from '../../store/memo-selector';
import { sameJson } from '../../store/same-json';
import { deviceValuesOf, rowsOf, type Device, type StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import { StreamParser, usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import {
  liveSensor,
  readingKey,
  readingKeys,
  trackedSensor,
  type PresenceReadings,
} from './presence-readings';

export function isPresence(device: Pick<Device, 'external_id'>): boolean {
  return device.external_id.startsWith(`${SHELLY_PLUGIN_ID}:`);
}

export function isPhysicalPresence(device: Device): boolean {
  return isPresence(device) && device.parent_id === null;
}

export const PRESENCE_INVENTORY = new StreamParser(SHELLY_SNAPSHOT);
const TRACKS = new StreamParser(SHELLY_TRACKS);
const NO_READINGS: PresenceReadings = { values: {}, observedAt: null };

function presenceSensor(inventory: ShellySnapshot, externalId: string): ShellyDevice | undefined {
  return inventory.devices.find(
    (sensor) =>
      sensor.externalId === externalId ||
      sensor.zones.some((zone) => zone.externalId === externalId),
  );
}

const deviceIds = memoOnInputs(
  (state) => [state.tables.devices],
  (state): ReadonlyMap<string, string> =>
    new Map(rowsOf(state.tables.devices).map((device) => [device.external_id, device.id])),
);

function readingsOf(state: StoreState, sensor: ShellyDevice | null): PresenceReadings {
  if (sensor === null) return NO_READINGS;
  const ids = deviceIds(state);
  const values: Record<string, JsonValue> = {};
  let observedAt: string | null = null;
  for (const [externalId, capability] of readingKeys(sensor)) {
    const id = ids.get(externalId);
    const reading = id === undefined ? undefined : deviceValuesOf(state, id)[capability];
    if (reading === undefined) continue;
    values[readingKey(externalId, capability)] = reading.value;
    if (observedAt === null || Date.parse(reading.observedAt) > Date.parse(observedAt))
      observedAt = reading.observedAt;
  }
  return { values, observedAt };
}

export function usePresence(device: Device): PluginStream<ShellyDevice> {
  const inventory = usePluginStream(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM, PRESENCE_INVENTORY);
  const base = useMemo(
    () =>
      inventory.state === 'ready'
        ? (presenceSensor(inventory.value, device.external_id) ?? null)
        : null,
    [inventory, device.external_id],
  );
  const readings = useStoreSelector((state) => readingsOf(state, base), sameJson, [base]);
  return useMemo((): PluginStream<ShellyDevice> => {
    if (inventory.state !== 'ready') return inventory;
    if (base === null)
      return {
        state: 'invalid',
        reason: 'This sensor was removed. Add it again in Shelly Presence settings.',
      };
    return { state: 'ready', value: liveSensor(base, readings), at: inventory.at };
  }, [inventory, base, readings]);
}

export function useTracked(sensor: ShellyDevice, enabled: boolean): ShellyDevice {
  const tracks = usePluginStream(SHELLY_PLUGIN_ID, SHELLY_TRACKS_STREAM, TRACKS, enabled);
  return useMemo(
    () => trackedSensor(sensor, tracks.state === 'ready' ? tracks.value : null),
    [sensor, tracks],
  );
}

import {
  SYNC_STATES,
  type CapabilityKey,
  type DeviceCapability,
  type DiscoveredDevice,
  type JsonValue,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import type { DeviceMirrorSpec } from '../device-mirror';

export const SYNCTHING_DRIVER_ID = 'syncthing';
export const SYNCTHING_EXTERNAL_ID = `${SYNCTHING_DRIVER_ID}:local`;

const COUNT = { kind: 'number', min: 0, max: 10_000, step: 1 } as const;

const SYNCTHING_CAPABILITIES: readonly DeviceCapability[] = [
  {
    key: 'sync_state',
    label: 'Sync',
    access: 'read',
    value: { kind: 'enum', options: [...SYNC_STATES] },
  },
  {
    key: 'sync_remaining',
    label: 'Left to sync',
    access: 'read',
    value: { kind: 'number', min: 0, max: 1e15, step: 1, unit: 'B' },
  },
  { key: 'sync_folders_behind', label: 'Folders behind', access: 'read', value: COUNT },
  { key: 'sync_peers_online', label: 'Devices connected', access: 'read', value: COUNT },
  { key: 'sync_paused', label: 'Paused', access: 'read_write', value: { kind: 'boolean' } },
];

function describeSyncthing(snapshot: SyncthingSnapshot): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: SYNCTHING_EXTERNAL_ID,
    parentExternalId: null,
    kind: 'file_sync',
    name: 'Syncthing',
    model: snapshot.version === null ? 'Syncthing' : `Syncthing ${snapshot.version}`,
    manufacturer: 'Syncthing',
    room: null,
    online: snapshot.connection.state === 'online',
    capabilities: [...SYNCTHING_CAPABILITIES],
    details: { deviceId: snapshot.myId },
  };
}

function syncthingReadings(snapshot: SyncthingSnapshot): ReadonlyMap<CapabilityKey, JsonValue> {
  const { summary } = snapshot;
  return new Map<CapabilityKey, JsonValue>([
    ['sync_state', summary.state],
    ['sync_remaining', summary.needBytes],
    ['sync_folders_behind', summary.foldersBehind],
    ['sync_peers_online', summary.peersOnline],
    ['sync_paused', summary.state === 'paused'],
  ]);
}

export const SYNCTHING_MIRROR: DeviceMirrorSpec<SyncthingSnapshot> = {
  externalId: SYNCTHING_EXTERNAL_ID,
  describe: describeSyncthing,
  readings: (snapshot) =>
    snapshot.connection.state === 'online' ? syncthingReadings(snapshot) : null,
  observedAt: (snapshot) => snapshot.at,
  sampled: null,
};

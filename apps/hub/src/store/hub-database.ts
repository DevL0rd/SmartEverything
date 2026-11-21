import { currentExecutionAuthority } from '../assistant/turn-authority';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CAPABILITY_KEY, type DeviceRow } from '@smarteverything/domain';
import {
  DEVICE_RECORD,
  type DeviceIdentity,
  type DeviceRecord,
  type HubDatabase,
} from '../database/port';
import type { Store } from './store';

function recordsOf(rows: readonly unknown[]): DeviceRecord[] {
  return rows.map((row) => DEVICE_RECORD.parse(row));
}

function identityOf(row: DeviceRow): DeviceIdentity {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    model: row.model,
    manufacturer: row.manufacturer,
    providerRoom: row.provider_room,
  };
}

type InventoryPart = Pick<
  HubDatabase,
  | 'loadDevices'
  | 'loadDeviceIdentities'
  | 'upsertDevices'
  | 'setDevicesOnline'
  | 'removeDevices'
  | 'matchRooms'
  | 'loadState'
  | 'upsertState'
  | 'insertEvents'
  | 'recordEventOccurrence'
  | 'enrichEvent'
  | 'loadCameras'
  | 'upsertCameras'
>;

function inventoryPart({ host }: Store): InventoryPart {
  return {
    loadDevices: async () => recordsOf(await host.call('devices', 'list')),
    loadDeviceIdentities: async () => (await host.call('devices', 'list')).map(identityOf),
    upsertDevices: async (rows) => recordsOf(await host.call('devices', 'upsert', rows)),
    setDevicesOnline: async (ids, online) =>
      recordsOf(await host.call('devices', 'setOnline', ids, online)),
    removeDevices: async (ids): Promise<void> => {
      await host.call('devices', 'remove', ids);
    },
    matchRooms: (names) => host.call('rooms', 'matchNames', names),
    loadState: async () =>
      (await host.call('state', 'list')).map((row) => ({
        deviceId: row.device_id,
        capability: CAPABILITY_KEY.parse(row.capability),
        value: row.value,
        observedAt: row.observed_at,
      })),
    upsertState: async (rows): Promise<void> => {
      await host.call('state', 'write', rows);
    },
    insertEvents: async (rows) => (await host.call('events', 'insert', rows)).map((row) => row.id),
    recordEventOccurrence: (event, occurrence) =>
      host.call('events', 'recordOccurrence', event, occurrence),
    enrichEvent: async (id, details): Promise<void> => {
      await host.call('events', 'enrich', id, details);
    },
    loadCameras: async () =>
      (await host.call('cameras', 'list')).map((camera) => ({
        deviceId: camera.device_id,
        recordEvents: camera.record_events,
      })),
    upsertCameras: async (rows): Promise<void> => {
      await host.call('cameras', 'upsert', rows);
    },
  };
}

type CommandPart = Pick<
  HubDatabase,
  'pendingCommands' | 'claimCommand' | 'finishCommand' | 'insertCommands' | 'updateProviderLink'
>;

function commandPart({ host }: Store): CommandPart {
  return {
    pendingCommands: () => host.call('commands', 'open'),
    claimCommand: (id, from) => host.write('claimCommand', { id, from }),
    finishCommand: async (id, outcome): Promise<void> => {
      await host.call('commands', 'finish', id, outcome);
    },
    insertCommands: (rows, ownerRunId) =>
      host.write('insertCommands', {
        commands: rows.map((row) => ({
          ...row,
          source: currentExecutionAuthority() === undefined ? row.source : 'assistant',
          requestedBy: null,
        })),
        ownerRunId,
        authority: currentExecutionAuthority() ?? null,
      }),
    updateProviderLink: async (provider, change): Promise<void> => {
      await host.call('providers', 'change', provider, change);
    },
  };
}

function controlPart(
  store: Store,
  recordingPath: (storagePath: string) => string,
): Omit<HubDatabase, keyof (InventoryPart & CommandPart)> {
  return {
    storeRecording: async (file, row): Promise<void> => {
      const path = recordingPath(file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, file.bytes, { mode: 0o600, flag: 'wx' });
      await store.host.call('cameras', 'addRecording', row);
    },
  };
}

export function storeDatabase(
  store: Store,
  recordingPath: (storagePath: string) => string,
): HubDatabase {
  return { ...inventoryPart(store), ...commandPart(store), ...controlPart(store, recordingPath) };
}

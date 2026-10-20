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

function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (cause) {
    return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
  }
}

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

function inventoryPart(store: Store): InventoryPart {
  return {
    loadDevices: () => settle(() => recordsOf(store.devices.list())),
    loadDeviceIdentities: () => settle(() => store.devices.list().map(identityOf)),
    upsertDevices: (rows) => settle(() => recordsOf(store.devices.upsert(rows))),
    setDevicesOnline: (ids, online) =>
      settle(() => recordsOf(store.devices.setOnline(ids, online))),
    removeDevices: (ids) =>
      settle(() => {
        store.devices.remove(ids);
      }),
    matchRooms: (names) => settle(() => store.rooms.matchNames(names)),
    loadState: () =>
      settle(() =>
        store.state.list().map((row) => ({
          deviceId: row.device_id,
          capability: CAPABILITY_KEY.parse(row.capability),
          value: row.value,
          observedAt: row.observed_at,
        })),
      ),
    upsertState: (rows) =>
      settle(() => {
        store.state.write(rows);
      }),
    insertEvents: (rows) => settle(() => store.events.insert(rows).map((row) => row.id)),
    recordEventOccurrence: (event, occurrence) =>
      settle(() => store.events.recordOccurrence(event, occurrence)),
    enrichEvent: (id, details) =>
      settle(() => {
        store.events.enrich(id, details);
      }),
    loadCameras: () =>
      settle(() =>
        store.cameras
          .list()
          .map((camera) => ({ deviceId: camera.device_id, recordEvents: camera.record_events })),
      ),
    upsertCameras: (rows) =>
      settle(() => {
        store.cameras.upsert(rows);
      }),
  };
}

type CommandPart = Pick<
  HubDatabase,
  'pendingCommands' | 'claimCommand' | 'finishCommand' | 'insertCommands' | 'updateProviderLink'
>;

function commandPart(store: Store): CommandPart {
  return {
    pendingCommands: () => settle(() => store.commands.open()),
    claimCommand: (id, from) =>
      settle(() => {
        if (!store.commands.claim(id, from)) return false;
        if (store.automationRuns.canDispatch(id)) return true;
        store.commands.finish(id, {
          status: 'failed',
          error: 'The owning automation run was cancelled before command dispatch.',
        });
        return false;
      }),
    finishCommand: (id, outcome) =>
      settle(() => {
        store.commands.finish(id, outcome);
      }),
    insertCommands: (rows, record) =>
      settle(() =>
        store.write(() => {
          const commands = store.commands.insert(
            rows.map((row) => ({
              ...row,
              source: currentExecutionAuthority() === undefined ? row.source : 'assistant',
              requestedBy: null,
            })),
          );
          record?.(commands);
          return commands;
        }),
      ),
    updateProviderLink: (provider, change) =>
      settle(() => {
        store.providers.change(provider, change);
      }),
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
      store.cameras.addRecording(row);
    },
  };
}

export function storeDatabase(
  store: Store,
  recordingPath: (storagePath: string) => string,
): HubDatabase {
  return { ...inventoryPart(store), ...commandPart(store), ...controlPart(store, recordingPath) };
}

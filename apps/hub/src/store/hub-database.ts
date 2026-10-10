import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CAPABILITY_KEY } from '@smarteverything/domain';
import { DEVICE_RECORD, type DeviceRecord, type HubDatabase } from '../database/port';
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

type InventoryPart = Pick<
  HubDatabase,
  | 'loadDevices'
  | 'upsertDevices'
  | 'setDevicesOnline'
  | 'removeDevices'
  | 'ensureRooms'
  | 'loadState'
  | 'upsertState'
  | 'insertEvents'
  | 'enrichEvent'
  | 'loadCameras'
  | 'upsertCameras'
>;

function inventoryPart(store: Store): InventoryPart {
  return {
    loadDevices: () => settle(() => recordsOf(store.devices.list())),
    upsertDevices: (rows) => settle(() => recordsOf(store.devices.upsert(rows))),
    setDevicesOnline: (ids, online) =>
      settle(() => recordsOf(store.devices.setOnline(ids, online))),
    removeDevices: (ids) =>
      settle(() => {
        store.devices.remove(ids);
      }),
    ensureRooms: (names) => settle(() => store.rooms.ensureNames(names)),
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
    claimCommand: (id, from) => settle(() => store.commands.claim(id, from)),
    finishCommand: (id, outcome) =>
      settle(() => {
        store.commands.finish(id, outcome);
      }),
    insertCommands: (rows) =>
      settle(() => store.commands.insert(rows.map((row) => ({ ...row, requestedBy: null })))),
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
    loadHome: () =>
      settle(() => {
        const settings = store.settings.read();
        return {
          timeZone: settings.time_zone,
          latitude: settings.latitude,
          longitude: settings.longitude,
        };
      }),
    loadAutomations: () =>
      settle(() =>
        store.automations.list().map((row) => ({
          id: row.id,
          name: row.name,
          enabled: row.enabled,
          definition: row.definition,
          runCount: row.run_count,
          lastError: row.last_error,
        })),
      ),
    loadScenes: () =>
      settle(() => store.scenes.list().map((row) => ({ id: row.id, actions: row.actions }))),
    updateAutomation: (id, change) =>
      settle(() => {
        store.automations.recordRun(id, change);
      }),
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

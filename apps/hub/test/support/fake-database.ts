import type { Provider } from '@smarteverything/domain';
import type {
  AutomationChange,
  AutomationRecord,
  CameraRecord,
  CameraUpsert,
  CommandInsert,
  CommandOutcome,
  CommandRow,
  DeviceRecord,
  DeviceUpsert,
  EventInsert,
  HomeRecord,
  HubDatabase,
  ProviderLinkChange,
  RecordingFile,
  RecordingInsert,
  SceneRecord,
  StateRecord,
} from '../../src/database/port';
import { nextId } from './ids';

export type StoredCommand = CommandRow;

export class FakeDatabase implements HubDatabase {
  readonly commands = new Map<string, StoredCommand>();
  readonly devices = new Map<string, DeviceRecord & { readonly name: string }>();
  readonly rooms = new Map<string, string>();
  readonly state = new Map<string, StateRecord>();
  readonly stateWrites: (readonly StateRecord[])[] = [];
  readonly events: (EventInsert & { readonly id: string })[] = [];
  readonly cameras = new Map<string, CameraUpsert & { recordEvents: boolean }>();
  readonly links = new Map<Provider, ProviderLinkChange>();
  readonly linkHistory: { readonly provider: Provider; readonly change: ProviderLinkChange }[] = [];
  readonly automationChanges: { readonly id: string; readonly change: AutomationChange }[] = [];
  readonly recordings: { readonly file: RecordingFile; readonly row: RecordingInsert }[] = [];
  home: HomeRecord = { timeZone: 'UTC', latitude: null, longitude: null };
  automations: AutomationRecord[] = [];
  scenes: SceneRecord[] = [];
  failNext: string | null = null;

  private run<T>(operation: string, work: () => T): Promise<T> {
    if (this.failNext === operation) {
      this.failNext = null;
      return Promise.reject(new Error(`${operation} failed on purpose`));
    }
    return Promise.resolve(work());
  }

  addCommand(row: Partial<CommandRow> & Pick<CommandRow, 'capability'>): StoredCommand {
    const command: StoredCommand = {
      id: nextId(),
      device_id: null,
      value: null,
      status: 'pending',
      source: 'app',
      result: null,
      error: null,
      requested_by: null,
      created_at: '2026-01-01T00:00:00.000Z',
      started_at: null,
      finished_at: null,
      expires_at: '2100-01-01T00:00:00.000Z',
      ...row,
    };
    this.commands.set(command.id, command);
    return command;
  }

  pendingCommands = (): Promise<readonly CommandRow[]> =>
    this.run('pendingCommands', () => {
      return [...this.commands.values()].filter(
        (command) => command.status === 'pending' || command.status === 'running',
      );
    });

  claimCommand = (id: string, from: CommandRow['status']): Promise<boolean> =>
    this.run('claimCommand', () => {
      const command = this.commands.get(id);
      if (command?.status !== from) {
        return false;
      }
      this.commands.set(id, { ...command, status: 'running' });
      return true;
    });

  finishCommand = (id: string, outcome: CommandOutcome): Promise<void> =>
    this.run('finishCommand', () => {
      const command = this.commands.get(id);
      if (command === undefined) {
        throw new Error(`no command ${id}`);
      }
      this.commands.set(id, {
        ...command,
        status: outcome.status,
        result: outcome.status === 'succeeded' ? outcome.result : null,
        error: outcome.status === 'failed' ? outcome.error : null,
      });
    });

  insertCommands = (rows: readonly CommandInsert[]): Promise<readonly CommandRow[]> =>
    this.run('insertCommands', () => {
      return rows.map((row) =>
        this.addCommand({
          device_id: row.deviceId,
          capability: row.capability,
          value: row.value,
          source: row.source,
        }),
      );
    });

  loadDevices = (): Promise<readonly DeviceRecord[]> =>
    this.run('loadDevices', () => [...this.devices.values()]);

  upsertDevices = (rows: readonly DeviceUpsert[]): Promise<readonly DeviceRecord[]> =>
    this.run('upsertDevices', () => {
      return rows.map((row) => {
        const existing = [...this.devices.values()].find(
          (device) => device.provider === row.provider && device.externalId === row.externalId,
        );
        const record = {
          id: existing?.id ?? nextId(),
          provider: row.provider,
          externalId: row.externalId,
          parentId: row.parentId,
          kind: row.kind,
          online: row.online,
          roomId: existing?.roomId ?? row.roomId,
          capabilities: [...row.capabilities],
          details: row.details,
          name: row.name,
        };
        this.devices.set(record.id, record);
        return record;
      });
    });

  setDevicesOnline = (ids: readonly string[], online: boolean): Promise<readonly DeviceRecord[]> =>
    this.run('setDevicesOnline', () =>
      ids.flatMap((id) => {
        const device = this.devices.get(id);
        if (device === undefined) {
          return [];
        }
        const updated = { ...device, online };
        this.devices.set(id, updated);
        return [updated];
      }),
    );

  ensureRooms = (names: readonly string[]): Promise<ReadonlyMap<string, string>> =>
    this.run('ensureRooms', () => {
      for (const name of names) {
        if (!this.rooms.has(name)) {
          this.rooms.set(name, nextId());
        }
      }
      return new Map(names.map((name) => [name, this.rooms.get(name) ?? '']));
    });

  loadState = (): Promise<readonly StateRecord[]> =>
    this.run('loadState', () => [...this.state.values()]);

  upsertState = (rows: readonly StateRecord[]): Promise<void> =>
    this.run('upsertState', () => {
      this.stateWrites.push(rows);
      for (const row of rows) {
        this.state.set(`${row.deviceId}|${row.capability}`, row);
      }
    });

  insertEvents = (rows: readonly EventInsert[]): Promise<readonly string[]> =>
    this.run('insertEvents', () => {
      return rows.map((row) => {
        const id = nextId();
        this.events.push({ ...row, id });
        return id;
      });
    });

  loadCameras = (): Promise<readonly CameraRecord[]> =>
    this.run('loadCameras', () =>
      [...this.cameras.values()].map((camera) => ({
        deviceId: camera.deviceId,
        recordEvents: camera.recordEvents,
      })),
    );

  upsertCameras = (rows: readonly CameraUpsert[]): Promise<void> =>
    this.run('upsertCameras', () => {
      for (const row of rows) {
        this.cameras.set(row.deviceId, {
          ...row,
          recordEvents: this.cameras.get(row.deviceId)?.recordEvents ?? true,
        });
      }
    });

  updateProviderLink = (provider: Provider, change: ProviderLinkChange): Promise<void> =>
    this.run('updateProviderLink', () => {
      this.linkHistory.push({ provider, change });
      this.links.set(provider, { ...this.links.get(provider), ...change });
    });

  loadHome = (): Promise<HomeRecord> => this.run('loadHome', () => this.home);

  loadAutomations = (): Promise<readonly AutomationRecord[]> =>
    this.run('loadAutomations', () => this.automations);

  loadScenes = (): Promise<readonly SceneRecord[]> => this.run('loadScenes', () => this.scenes);

  updateAutomation = (id: string, change: AutomationChange): Promise<void> =>
    this.run('updateAutomation', () => {
      this.automationChanges.push({ id, change });
    });

  storeRecording = (file: RecordingFile, row: RecordingInsert): Promise<void> =>
    this.run('storeRecording', () => {
      this.recordings.push({ file, row });
    });
}
